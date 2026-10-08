// Mock 과거 스냅샷 생성기
// - 1년 이상(2025-09-01 ~ 최근 08:00) 일별 스냅샷을 "항상 같은 값"이 나오도록 만들어 냅니다(시드 고정 난수).
// - 가격·환율은 날짜별로 변동하며, 마지막 날짜의 값이 mock/prices.js, mock/fx.js 의 현재 값과 같아집니다.
// - QQQ 분류는 2026-04-01 전에는 NASDAQ100, 그 이후에는 SP500 으로 저장됩니다 (시나리오 ⑤ 검수용).
// - 2026-03-31에 해지된 '키움 연금저축(해지)' 계좌가 그 전 이력에만 나타납니다 (과거 계좌명 고정 검수용).
window.MOCK = window.MOCK || {};

window.MOCK.snapshotPlan = {
  startDate: '2025-09-01',
  qqqSp500From: '2026-04-01',
  closedAccount: {
    id: 'acc-old-pension',
    name: '키움 연금저축(해지)',
    closedOn: '2026-03-31',
    holdings: [
      { instrument_id: 'ins-kodex-sp500', quantity: 200, avg_price: 15800, avg_fx_rate: 1 },
      { instrument_id: 'ins-cash-krw', quantity: 150000, avg_price: 1, avg_fx_rate: 1 }
    ]
  },
  // 과거 수량 = 현재 Mock 수량 × factor (기간별 적립 매수 효과)
  qtyPhases: [
    { until: '2025-12-31', factor: 0.7 },
    { until: '2026-06-30', factor: 0.85 }
  ]
};

window.MOCK.buildBaseSnapshots = function (lastDate, makeSnapshot) {
  const plan = window.MOCK.snapshotPlan;

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rand(seed) {
    let t = (seed + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(key) {
    const u1 = Math.max(rand(hash(key)), 1e-9);
    const u2 = rand(hash(key + '#'));
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const dates = [];
  for (let d = plan.startDate; d <= lastDate; d = addDays(d, 1)) dates.push(d);
  const N = dates.length;
  if (!N) return [];

  const insts = window.MOCK.instruments;
  const priceNow = window.MOCK.prices.values;
  const volByType = { CASH: 0, ETF: 0.011, STOCK: 0.018, CRYPTO: 0.03, GOLD: 0.008 };
  const muByType = { CASH: 0, ETF: 0.0005, STOCK: 0.0005, CRYPTO: 0.001, GOLD: 0.0007 };
  const override = {
    'ins-qld': { vol: 0.024, mu: 0.0009 },
    'ins-tiger-ndx-lev': { vol: 0.024, mu: 0.0009 },
    'ins-kodex-cd': { vol: 0.0002, mu: 0.00012 },
    'ins-tiger-tbill': { vol: 0.002, mu: 0.0001 }
  };

  // 가격 변동 계수: 마지막 날짜 = 1, 과거로 갈수록 일별 수익률을 되돌립니다.
  const factor = {};
  insts.forEach(inst => {
    const arr = new Array(N);
    arr[N - 1] = 1;
    const vol = (override[inst.id] || {}).vol ?? volByType[inst.asset_type] ?? 0.012;
    const mu = (override[inst.id] || {}).mu ?? muByType[inst.asset_type] ?? 0.0005;
    for (let i = N - 1; i > 0; i--) {
      const z = 0.6 * gauss('mkt' + dates[i]) + 0.8 * gauss(inst.id + dates[i]);
      arr[i - 1] = arr[i] / Math.exp(mu + vol * z);
    }
    factor[inst.id] = arr;
  });
  const fxArr = new Array(N);
  fxArr[N - 1] = window.MOCK.fx.rate;
  for (let i = N - 1; i > 0; i--) fxArr[i - 1] = fxArr[i] / Math.exp(0.00005 + 0.0035 * gauss('fx' + dates[i]));

  const instMap = Object.fromEntries(insts.map(i => [i.id, i]));
  const accMap = Object.fromEntries(window.MOCK.accounts.map(a => [a.id, a]));

  function priceOf(inst, i) {
    if (inst.asset_type === 'CASH') return 1;
    const p = (priceNow[inst.id] ?? 0) * factor[inst.id][i];
    if (inst.currency === 'USD') return Math.round(p * 100) / 100;
    if (p >= 10000000) return Math.round(p / 1000) * 1000;
    return Math.round(p);
  }
  function scaleQty(inst, q, f) {
    if (f === 1) return q;
    const v = q * f;
    if (inst.asset_type === 'CRYPTO') return Math.round(v * 1e8) / 1e8;
    if (inst.asset_type === 'CASH') return inst.currency === 'USD' ? Math.round(v * 100) / 100 : Math.round(v / 1000) * 1000;
    return Math.max(1, Math.round(v));
  }
  function instAt(inst, date) {
    if (inst.id === 'ins-qqq') return { ...inst, asset_group: date < plan.qqqSp500From ? 'NASDAQ100' : 'SP500' };
    return inst;
  }

  const result = [];
  dates.forEach((date, i) => {
    const phase = plan.qtyPhases.find(p => date <= p.until);
    const f = phase ? phase.factor : 1;
    const entries = [];
    window.MOCK.holdings.forEach(h => {
      const inst = instMap[h.instrument_id];
      entries.push({
        account: accMap[h.account_id],
        instrument: instAt(inst, date),
        holding: { quantity: scaleQty(inst, h.quantity, f), avg_price: h.avg_price, avg_fx_rate: h.avg_fx_rate },
        price: priceOf(inst, i)
      });
    });
    if (date <= plan.closedAccount.closedOn) {
      plan.closedAccount.holdings.forEach(h => {
        const inst = instMap[h.instrument_id];
        entries.push({
          account: { id: plan.closedAccount.id, name: plan.closedAccount.name },
          instrument: instAt(inst, date),
          holding: { quantity: h.quantity, avg_price: h.avg_price, avg_fx_rate: h.avg_fx_rate },
          price: priceOf(inst, i)
        });
      });
    }
    result.push(makeSnapshot(date, entries, Math.round(fxArr[i] * 100) / 100));
  });
  return result;
};
