// 손익 계산 (14항) — 화면에서 계산하고 저장하지 않습니다(16항)
window.Calc = (function () {
  const pct = (p, i) => (i ? (p / i) * 100 : 0);

  // 보유 1행 계산. h = {quantity, avg_price, avg_fx_rate}, price = 원본통화 현재가, fxEval = 평가 시점 환율
  function row(h, currency, price, fxEval) {
    const isUSD = currency === 'USD';
    const q = +h.quantity, ap = +h.avg_price, cp = +price;
    const fxBuy = isUSD ? +h.avg_fx_rate : 1;
    const fxE = isUSD ? +fxEval : 1;
    const invO = q * ap, valO = q * cp, profO = valO - invO;
    const invK = invO * fxBuy, valK = valO * fxE, profK = valK - invK;
    // 금환산용 달러 금액: 달러 자산 = 달러 그대로, 원화 자산(현물금 포함) = 그 시점 환율로 달러로 바꾼 금액
    const fxNow = +fxEval || 0;
    const uv = isUSD ? valO : fxNow ? valK / fxNow : 0, ui = isUSD ? invO : fxNow ? invK / fxNow : 0;
    return {
      currency, q, ap, cp, fxBuy, fxE,
      invO, valO, profO, retO: pct(profO, invO),
      invK, valK, profK, retK: pct(profK, invK), uv, ui,
      // 손익 분해 (사용자 결정 2026-10-09: 환차손익은 매입금액 기준)
      priceP: (cp - ap) * q * fxE, // 가격손익 = 달러 손익 × 평가 환율
      fxP: q * ap * (fxE - fxBuy) // 환차손익 = 매입금액(달러) × 환율 변동
    };
  }

  function emptyAgg() {
    return { invK: 0, valK: 0, profK: 0, priceP: 0, fxP: 0, q: 0, invO: 0, valO: 0, uv: 0, ui: 0, kr: { inv: 0, val: 0 }, us: { inv: 0, val: 0 }, nKR: 0, nUS: 0, n: 0 };
  }
  function add(a, r) {
    a.invK += r.invK; a.valK += r.valK; a.profK += r.profK; a.priceP += r.priceP; a.fxP += r.fxP;
    a.q += r.q; a.invO += r.invO; a.valO += r.valO; a.uv += r.uv || 0; a.ui += r.ui || 0; a.n++;
    if (r.currency === 'USD') { a.us.inv += r.invO; a.us.val += r.valO; a.nUS++; }
    else { a.kr.inv += r.invK; a.kr.val += r.valK; a.nKR++; }
    return a;
  }

  // 통화 모드별 표시값 (14-4). 합계 수익률 = 합계 손익 ÷ 합계 투자금액
  // 금 환산(GOLD): 그 시점의 달러 금액 ÷ 국제 금시세(달러/온스) × 31.1035 = 금 몇 g
  //   달러 자산 = 달러 금액 그대로, 원화 자산(현물금 포함) = 그 시점 원/달러 환율로 달러로 바꾼 금액 (row 의 uv·ui)
  //   투자금액도 같은 규칙 → 수익률은 '금 기준' 수익률. gold = 그 시점 금시세(달러/온스), 안 주면 지금 금시세(setGold)
  const TROY_OZ_G = 31.1034768;
  let goldNow = null;
  function setGold(usdPerOz) { goldNow = usdPerOz > 0 ? usdPerOz : null; }
  const toGram = (usd, xau) => (usd / xau) * TROY_OZ_G;
  function view(a, mode, fx, gold) {
    if (mode === 'GOLD') {
      const x = gold || goldNow;
      if (x) {
        const inv = toGram(a.ui, x), val = toGram(a.uv, x);
        return { parts: [{ cur: 'XAU', inv, val, prof: val - inv, ret: pct(val - inv, inv) }] };
      }
      mode = 'KRW'; // 금 시세가 없으면 원화로
    }
    if (mode === 'USD') {
      const f = fx || 1;
      return { parts: [{ cur: 'USD', inv: a.invK / f, val: a.valK / f, prof: a.profK / f, ret: pct(a.profK, a.invK) }] };
    }
    if (mode === 'MIXED') {
      const parts = [];
      if (a.nKR || !a.nUS) parts.push({ cur: 'KRW', inv: a.kr.inv, val: a.kr.val, prof: a.kr.val - a.kr.inv, ret: pct(a.kr.val - a.kr.inv, a.kr.inv) });
      if (a.nUS) parts.push({ cur: 'USD', inv: a.us.inv, val: a.us.val, prof: a.us.val - a.us.inv, ret: pct(a.us.val - a.us.inv, a.us.inv) });
      return { parts, refRetK: a.nUS && !a.nKR ? pct(a.profK, a.invK) : null };
    }
    return {
      parts: [{ cur: 'KRW', inv: a.invK, val: a.valK, prof: a.profK, ret: pct(a.profK, a.invK) }],
      split: a.nUS ? { priceP: a.priceP, fxP: a.fxP } : null
    };
  }

  // 공통 모델: rows → 전체 / 자산군(→종목→계좌) / 계좌 집계
  function assemble(rows, accountList, fx) {
    const total = emptyAgg();
    const groups = {};
    Groups.codes.forEach(c => (groups[c] = { code: c, agg: emptyAgg(), insts: {} }));
    const accounts = accountList.map(a => ({ ...a, agg: emptyAgg(), rows: [] }));
    const accById = Object.fromEntries(accounts.map(a => [a.key, a]));
    rows.forEach(x => {
      add(total, x.r);
      const g = groups[x.group];
      add(g.agg, x.r);
      if (!g.insts[x.inst.id]) g.insts[x.inst.id] = { inst: x.inst, unassigned: x.unassigned, noPrice: x.noPrice, agg: emptyAgg(), rows: [] };
      add(g.insts[x.inst.id].agg, x.r);
      g.insts[x.inst.id].rows.push(x);
      const acc = accById[x.accKey];
      if (acc) { add(acc.agg, x.r); acc.rows.push(x); }
    });
    return { rows, total, groups, accounts, fx };
  }

  // 현재 현황 모델
  function buildModel({ accounts, holdings, instruments, prices, fx, priceMeta = {} }) {
    const instMap = Object.fromEntries(instruments.map(i => [i.id, i]));
    const rows = [];
    holdings.forEach(h => {
      const inst = instMap[h.instrument_id];
      if (!inst) return;
      let price = inst.asset_type === 'CASH' ? 1 : prices[inst.id];
      const noPrice = price == null;
      if (noPrice) price = h.avg_price; // Mock 가격이 없는 신규 종목은 평균매입가로 대체
      rows.push({
        holding: h, accKey: h.account_id, inst, group: Groups.of(inst), unassigned: !inst.asset_group, noPrice, priceMeta: priceMeta[inst.id] || null,
        r: row(h, inst.currency, price, fx)
      });
    });
    const accList = accounts.map(a => ({ key: a.id, id: a.id, name: a.name, broker: a.broker, account: a }));
    return assemble(rows, accList, fx);
  }

  // 스냅샷 모델 — 당시 asset_group, 계좌명, 환율(exchange_rate), 매입환율(avg_fx_rate)만 사용 (18·21항)
  function buildSnapshotModel(items) {
    const accList = [];
    const seen = {};
    const rows = items.map(it => {
      const accKey = it.account_id + '|' + it.account_name;
      if (!seen[accKey]) { seen[accKey] = true; accList.push({ key: accKey, id: it.account_id, name: it.account_name }); }
      const inst = { id: it.instrument_id, name: it.name, symbol: it.symbol, exchange: it.exchange, asset_type: it.asset_type, currency: it.currency, asset_group: it.asset_group };
      return {
        item: it, accKey, inst, group: Groups.of(it), unassigned: false, // 그 뒤 삭제된 자산군은 기타종목으로
        r: row(it, it.currency, it.current_price, it.exchange_rate)
      };
    });
    const fx = items.length ? items[0].exchange_rate : null;
    return assemble(rows, accList, fx);
  }

  // 금액을 비율만큼 나눈 행 (혼합 성향: 성55배45 → 성장 55% · 배당 45%)
  function scaleRow(r, f) {
    if (f === 1) return r;
    const o = { ...r };
    ['q', 'invO', 'valO', 'profO', 'invK', 'valK', 'profK', 'priceP', 'fxP', 'uv', 'ui'].forEach(k => { o[k] = r[k] * f; });
    return o;
  }
  // 자산군 대신 다른 기준(추종 통화 · 자산 성향)으로 묶은 통계
  // def = { list: [{code,name,color}], split(inst) → [[코드, 비율], ...] }  → { list, groups: {코드: {agg, insts}} }
  function dimension(model, def) {
    const groups = {};
    def.list.forEach(d => (groups[d.code] = { code: d.code, agg: emptyAgg(), insts: {} }));
    model.rows.forEach(x => {
      def.split(x.inst).forEach(([code, f]) => {
        const g = groups[code];
        if (!g) return;
        const r = scaleRow(x.r, f);
        add(g.agg, r);
        if (!g.insts[x.inst.id]) g.insts[x.inst.id] = { inst: x.inst, share: f, unassigned: false, noPrice: x.noPrice, agg: emptyAgg(), rows: [] };
        add(g.insts[x.inst.id].agg, r);
        g.insts[x.inst.id].rows.push({ ...x, r });
      });
    });
    return { list: def.list, groups };
  }

  return { pct, row, emptyAgg, add, view, setGold, toGram, TROY_OZ_G, get goldNow() { return goldNow; }, buildModel, buildSnapshotModel, scaleRow, dimension };
})();
