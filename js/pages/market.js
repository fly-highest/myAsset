// 시장 지표 (market.html) — QQQ · SPY · GLD · 비트코인 · VIX · USD/KRW 환율 · 달러 인덱스 · WTI/브렌트유
// 일별 종가는 DB fx_daily (과거 = 업로드한 CSV, 이후 = 매시 15분 자동 추가: Google Finance 우선, 안 되면 Yahoo)
// - 위쪽 기간 버튼(1주~10년): 차트에 보이는 구간 + 환율·달러 인덱스·유가의 '기간 평균' 칸
// - 차트마다 이동평균 체크박스: 5일 · 20일 · 50일 · 120일 · 200일 (자료 개수 기준) · 1년 · 3년 · 5년 (날짜 기준), QQQ 는 200일 ±1% 추가
(function () {
  const FX_PERIODS = [['1W', '1주', 7], ['1M', '1개월', 1], ['3M', '3개월', 3], ['1Y', '1년', 12], ['3Y', '3년', 36], ['5Y', '5년', 60], ['10Y', '10년', 120]];
  const FX_KEY = 'myAsset.invest.fxPeriod';
  let fxPeriod = '1Y';
  try { const s = localStorage.getItem(FX_KEY); if (s === 'MAX' || FX_PERIODS.some(p => p[0] === s)) fxPeriod = s; } catch (e) { /* 무시 */ }
  const dec2 = v => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fx2 = v => '₩' + dec2(v);
  const usd = v => '$' + dec2(v), usdTick = v => '$' + Number(v).toLocaleString('ko-KR');
  // 선 색은 모든 차트에서 같게: 종가 = 파랑(두 번째 지표 = 검정), 이동평균은 종류마다 같은 색 (50일 = 주황, 200일 = 빨강 …)
  const PRICE = '#2457d6', PRICE2 = '#111827', BAND = '#fca5a5';
  // ma: 처음 체크되어 있는 이동평균 (사용자가 바꾸면 이 브라우저에 기억)
  const MARKETS = [
    { id: 'qqq', sma: true, band: true, title: 'QQQ (나스닥100 ETF)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['n50', 'n200', 'band'],
      series: [{ pair: 'QQQ', label: 'QQQ', color: PRICE }] },
    { id: 'spy', sma: true, title: 'SPY (S&P500 ETF)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'SPY', label: 'SPY', color: PRICE }] },
    // 코스피 · 코스닥 지수 (포인트, 한국 날짜) — QQQ 와 같은 구성에서 200일 ±1% 띠만 뺌 (50일선 · 200일선)
    { id: 'kospi', sma: true, title: '코스피 (KOSPI 지수)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '1996-12-11', ma: ['n50', 'n200'],
      series: [{ pair: 'KOSPI', label: '코스피', color: PRICE }] },
    { id: 'kosdaq', sma: true, title: '코스닥 (KOSDAQ 지수)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2000-10-16', ma: ['n50', 'n200'],
      series: [{ pair: 'KOSDAQ', label: '코스닥', color: PRICE }] },
    // CNN 공포·탐욕 지수 (미국 주식, 0~100): 0~25 극단적 공포 · 25~45 공포 · 45~55 중립 · 55~75 탐욕 · 75~100 극단적 탐욕
    // 2011-01 ~ 2021-01 은 사용자가 올린 CSV, 그 뒤는 CNN (CNN 의 2021-01-21 이전 값은 50 고정 자리 채움이라 쓰지 않음)
    // alertWhen: 이동평균과 상관없이 75 이상(극단적 탐욕)일 때만 깜빡임
    { id: 'fng', title: 'CNN 공포·탐욕 지수 (미국 주식, 0~100) · 낮을수록 공포, 높을수록 탐욕 · 75 이상(극단적 탐욕)일 때만 깜빡임', fmt: v => Number(v).toFixed(1), tick: v => v, since: '2011-01-03', ma: ['n50'],
      alertWhen: v => (v >= 75 ? `극단적 탐욕: 현재 ${Number(v).toFixed(1)} ≥ 75` : null),
      grade: fngGrade, gradeNote: '기준: 0~25 미만 극단적 공포 · 25~45 미만 공포 · 45~55 미만 중립 · 55~75 미만 탐욕 · 75 이상 극단적 탐욕',
      series: [{ pair: 'FNG', label: '공포·탐욕', color: PRICE }] },
    { id: 'gld', sma: true, title: 'GLD (금 ETF)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'GLD', label: 'GLD', color: PRICE }] },
    // 비트코인은 주말에도 거래 → 매일 저장, n일선도 달력 날짜 기준
    { id: 'btc', sma: true, everyDay: true, title: '비트코인 (BTC/USD)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'BTC', label: 'BTC', color: PRICE }] },
    // VIX: 미국 S&P500 옵션으로 계산한 '공포 지수' (변동성). 단위 없음 — 위쪽 칸은 현재 · 기간 평균
    // alertAbove: 경고 깜빡임을 반대로 — 현재 값이 이동평균선 '위'일 때 (VIX · 달러 인덱스 · 유가 · 금리 · 김치 프리미엄은 오를수록 부담)
    { id: 'vix', alertAbove: true, title: 'VIX (CBOE 변동성 지수)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'VIX', label: 'VIX', color: PRICE }] },
    { id: 'fx', title: 'USD/KRW 환율', fmt: fx2, tick: v => '₩' + Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'USD/KRW', label: 'USD/KRW', color: PRICE, live: true }] },
    { id: 'dxy', alertAbove: true, title: '달러 인덱스 (DXY)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'DXY', label: '달러 인덱스', color: PRICE }] },
    { id: 'oil', alertAbove: true, title: '국제 유가 (WTI · 브렌트유, 달러/배럴)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'WTI', label: 'WTI유', color: PRICE }, { pair: 'BRENT', label: '브렌트유', color: PRICE2 }] },
    // 금리·스프레드는 '현재 − 평균'을 %가 아니라 차이(%p)로 보여 줌 (diffAbs)
    { id: 'ust', alertAbove: true, title: '미국 국채금리 (10년 · 2년, %)', fmt: pctFmt, tick: v => v + '%', since: '2016-10-11', ma: [], diffAbs: true, unitSrc: '미 재무부 공식 금리',
      series: [{ pair: 'UST10Y', label: '10년물', color: PRICE }, { pair: 'UST2Y', label: '2년물', color: PRICE2 }] },
    { id: 'spread', title: '장단기 금리차 (미국 10년 − 2년, %p) · 0 아래 = 금리 역전(경기침체 신호)', fmt: ppFmt, tick: v => v + '%p', since: '2016-10-11', ma: [], diffAbs: true, zero: true,
      series: [{ pair: 'UST10Y2Y', label: '10년 − 2년', color: PRICE }] },
    { id: 'kimchi', alertAbove: true, title: '김치 프리미엄 (비트코인, %) · 업비트 원화 시세 ÷ (달러 시세 × 환율) − 1', fmt: ppFmt, tick: v => v + '%', since: '2017-09-25', ma: ['n20'], diffAbs: true, zero: true, everyDay: true,
      series: [{ pair: 'KIMCHI', label: '김치 프리미엄', color: PRICE, derive: kimchiHistory }] },
    // 비트코인 도미넌스: 업비트 데이터랩 기준 (업비트가 정한 코인 범위의 시가총액 중 비트코인 비중) — 코인게코·TradingView 와 숫자가 다름
    { id: 'btcdom', title: '비트코인 도미넌스 (%, 업비트 데이터랩 기준) · 코인 시가총액 중 비트코인 비중', fmt: pctFmt, tick: v => v + '%', since: '2017-10-01', ma: ['n50', 'n200'], diffAbs: true, everyDay: true,
      series: [{ pair: 'BTC_DOM', label: '도미넌스', color: PRICE }] },
    { id: 'cugold', title: '구리 / 금 가격 비율 (×1000) · 오르면 경기 기대, 내리면 안전자산 선호', fmt: v => Number(v).toFixed(3), tick: v => Number(v).toFixed(2), since: '2016-10-11', ma: ['n200'],
      series: [{ pair: 'CUGOLD', label: '구리/금', color: PRICE, derive: copperGoldHistory }] },
    { id: 'ausilver', title: '금 / 은 가격 비율 · 금 1온스로 살 수 있는 은의 온스 · 높으면 은이 상대적으로 쌈', fmt: dec2, tick: v => Number(v).toFixed(0), since: '2000-08-30', ma: ['n200'],
      series: [{ pair: 'AUAG', label: '금/은', color: PRICE, derive: goldSilverHistory }] },
    { id: 'kr3y', alertAbove: true, title: '한국 국채 3년 (%)', fmt: pctFmt, tick: v => v + '%', since: '2023-10-11', ma: [], diffAbs: true,
      series: [{ pair: 'KR3Y', label: '국채 3년', color: PRICE }] },
    { id: 'kb50', title: 'KB 선도아파트 50 지수 (월간, 2008-12~)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2008-12', ma: ['y1'], monthly: true,
      series: [{ pair: 'KB_LEAD50', label: 'KB 선도50', color: PRICE }] },
    // PIR = 아파트 가격 ÷ 연소득 (KB 아파트담보대출 기준, 중간값) → 소득을 한 푼도 안 쓰고 몇 년 모아야 집을 사는지
    { id: 'pir', title: '소득 대비 주택가격 PIR (KB 아파트담보대출, 배 · 분기, 2008~) · 연소득을 몇 년 모아야 아파트를 사는지', fmt: v => dec2(v) + '배', tick: v => v + '배', since: '2008-03', ma: [], monthly: true, quarterly: true,
      series: [{ pair: 'KB_PIR_SEOUL', label: '서울', color: PRICE }, { pair: 'KB_PIR_GG', label: '경기', color: PRICE2 }] }
  ];
  // CNN 공포·탐욕 등급 (CNN 이 붙인 등급과 같은 경계: 25 · 45 · 55 · 75)
  function fngGrade(v) {
    return v < 25 ? '극단적 공포 (Extreme Fear)' : v < 45 ? '공포 (Fear)' : v < 55 ? '중립 (Neutral)' : v < 75 ? '탐욕 (Greed)' : '극단적 탐욕 (Extreme Greed)';
  }
  function pctFmt(v) { return dec2(v) + '%'; }
  function ppFmt(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + dec2(Math.abs(v)) + '%'; }
  // 날짜 → 값 (그 날짜에 없으면 그 전 마지막 값)
  function lookup(hist) {
    const ds = hist.map(r => r.date), vs = hist.map(r => r.close);
    return d => { let lo = 0, hi = ds.length - 1, hit = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (ds[mid] <= d) { hit = mid; lo = mid + 1; } else hi = mid - 1; } return hit == null ? null : vs[hit]; };
  }
  // 김치 프리미엄(%) = 업비트 원화 시세 ÷ (비트코인 달러 시세 × 원/달러 환율) − 1, 날짜별
  async function kimchiHistory() {
    const [krw, usdBtc, fx] = await Promise.all(['BTC_KRW', 'BTC', 'USD/KRW'].map(p => DataService.getFxHistory(p)));
    const b = lookup(usdBtc), f = lookup(fx);
    return krw.map(r => { const u = b(r.date), x = f(r.date); return u && x ? { date: r.date, close: Math.round((r.close / (u * x) - 1) * 10000) / 100, source: 'CALC' } : null; }).filter(Boolean);
  }
  // 구리/금 비율 = 구리(달러/파운드) ÷ 금(달러/온스) × 1000
  async function copperGoldHistory() {
    const [cu, au] = await Promise.all(['COPPER', 'XAU'].map(p => DataService.getFxHistory(p)));
    const g = lookup(au);
    return cu.map(r => { const x = g(r.date); return x ? { date: r.date, close: Math.round((r.close / x) * 1e6) / 1000, source: 'CALC' } : null; }).filter(Boolean);
  }

  // 금/은 비율 = 금(달러/온스) ÷ 은(달러/온스)
  async function goldSilverHistory() {
    const [au, ag] = await Promise.all(['XAU', 'SILVER'].map(p => DataService.getFxHistory(p)));
    const s = lookup(ag);
    return au.map(r => { const x = s(r.date); return x ? { date: r.date, close: Math.round((r.close / x) * 100) / 100, source: 'CALC' } : null; }).filter(Boolean);
  }

  // 이동평균 종류: [키, 이름, 길이, 색] — n = 자료 개수(거래일, 비트코인은 날짜), y = 달력 기간(개월)
  const MA_OPTS = [
    ['n5', '5일', 5, '#94a3b8'], ['n20', '20일', 20, '#06b6d4'], ['n50', '50일', 50, '#f59e0b'], ['n120', '120일', 120, '#16a34a'],
    ['n200', '200일', 200, '#dc2626'], ['y1', '1년', 12, '#db2777'], ['y3', '3년', 36, '#92400e'], ['y5', '5년', 60, '#7c3aed']
  ];
  const MA_KEY = id => 'myAsset.market.ma.' + id;
  function maSelected(m) {
    try { const s = JSON.parse(localStorage.getItem(MA_KEY(m.id))); if (Array.isArray(s)) return s; } catch (e) { /* 무시 */ }
    return m.ma.slice();
  }
  const saveMa = (m, sel) => { try { localStorage.setItem(MA_KEY(m.id), JSON.stringify(sel)); } catch (e) { /* 무시 */ } };
  // 사용자가 [⚙ 설정]에서 추가한 이동평균 (차트마다 따로, 이 브라우저에 기억): [키, 이름, 길이, 색]
  //   키 n{일수} = 최근 n개 자료(거래일) 평균, ym{개월수} = 날짜마다 그 기간 전까지의 평균 (기본 1년·3년·5년과 같은 방식)
  const MAC_KEY = id => 'myAsset.market.maCustom.' + id;
  function maCustom(m) {
    try {
      const s = JSON.parse(localStorage.getItem(MAC_KEY(m.id)));
      if (Array.isArray(s)) return s.filter(o => Array.isArray(o) && /^(n|ym)\d+$/.test(o[0]) && o[2] > 0 && /^#[0-9a-f]{6}$/i.test(o[3]));
    } catch (e) { /* 무시 */ }
    return [];
  }
  const saveMaCustom = (m, list) => { try { localStorage.setItem(MAC_KEY(m.id), JSON.stringify(list)); } catch (e) { /* 무시 */ } };
  // 지운 기본 이동평균 (차트마다): [⚙ 설정]에서 [삭제]한 기본 이동평균(5일~5년) 키 목록
  const MAH_KEY = id => 'myAsset.market.maHidden.' + id;
  function maHidden(m) { try { const s = JSON.parse(localStorage.getItem(MAH_KEY(m.id))); if (Array.isArray(s)) return s; } catch (e) { /* 무시 */ } return []; }
  const saveMaHidden = (m, h) => { try { localStorage.setItem(MAH_KEY(m.id), JSON.stringify(h)); } catch (e) { /* 무시 */ } };
  // 이 차트의 이동평균 목록 = 지우지 않은 기본 + 추가한 것 (같은 키면 기본 우선)
  // 짧은 기간이 왼쪽: 기간 오름차순 (일 = 거래일 수, 개월·년 = 개월 × 21거래일로 비교)
  const maSpan = o => (o[0][0] === 'n' ? o[2] : o[2] * 21);
  const optsOf = (custom, hidden) => { const base = MA_OPTS.filter(o => !hidden.includes(o[0])); return [...base, ...custom.filter(c => !base.some(o => o[0] === c[0]))].sort((a, b) => maSpan(a) - maSpan(b)); };
  // 이동평균 색 바꾸기 (차트마다, 키 → #RRGGBB). 정하지 않은 선은 원래 색
  const MACOL_KEY = id => 'myAsset.market.maColor.' + id;
  function maColors(m) { try { const s = JSON.parse(localStorage.getItem(MACOL_KEY(m.id))); if (s && typeof s === 'object') return s; } catch (e) { /* 무시 */ } return {}; }
  const saveMaColors = (m, c) => { try { localStorage.setItem(MACOL_KEY(m.id), JSON.stringify(c)); } catch (e) { /* 무시 */ } };
  const colored = (list, colors) => list.map(o => (/^#[0-9a-f]{6}$/i.test(colors[o[0]] || '') ? [o[0], o[1], o[2], colors[o[0]]] : o));
  const maOpts = m => colored(optsOf(maCustom(m), maHidden(m)), maColors(m));
  // 이동평균 선 두께 (차트마다, 키별 1~10). 정하지 않은 선은 기본 두께
  const MAW_KEY = id => 'myAsset.market.maWidth.' + id;
  function maWidths(m) { try { const s = JSON.parse(localStorage.getItem(MAW_KEY(m.id))); if (s && typeof s === 'object') return s; } catch (e) { /* 무시 */ } return {}; }
  const saveMaWidths = (m, w) => { try { localStorage.setItem(MAW_KEY(m.id), JSON.stringify(w)); } catch (e) { /* 무시 */ } };
  const maWidth = (m, k, def) => { const v = Number(maWidths(m)[k]); return v >= 1 && v <= 10 ? v : def; };

  // n개 단순 이동평균. 앞쪽에 n개가 안 되는 날은 null
  const smaN = (hist, n) => { let sum = 0; return hist.map((r, i) => { sum += r.close; if (i >= n) sum -= hist[i - n].close; return i >= n - 1 ? sum / n : null; }); };
  const monthsBack = (d, months) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() - months); return x.toISOString().slice(0, 10); };
  // 기간 이동평균: 날짜마다 그 날부터 기간만큼 거슬러 올라간 종가 평균. 저장된 자료가 기간보다 짧은 날은 null
  function smaMonths(hist, months) {
    let j = 0, sum = 0;
    return hist.map((r, i) => {
      sum += r.close;
      const s = monthsBack(r.date, months);
      while (hist[j].date <= s) { sum -= hist[j].close; j++; }
      return hist[0].date <= s ? sum / (i - j + 1) : null;
    });
  }
  const maValues = (hist, key, m) => { const o = maOpts(m).find(x => x[0] === key); if (!o) return hist.map(() => null); return key[0] === 'n' ? smaN(hist, o[2]) : smaMonths(hist, o[2]); };

  // 표시 구간(기간 버튼)의 자료 + 기간 단순 평균·최고·최저
  function seriesCalc(hist, p) {
    const startOf = d => (p[0] === 'MAX' ? '0000-00-00' : p[0] === '1W' ? Fmt.addDays(d, -p[2]) : monthsBack(d, p[2]));
    const last = hist.length ? hist[hist.length - 1].date : Fmt.todayKST();
    const rows = hist.filter(r => r.date > startOf(last));
    const avg = rows.length ? rows.reduce((s, r) => s + r.close, 0) / rows.length : null;
    let hiRow = null, loRow = null; // 기간 내 최고 · 최저 (같은 값이면 가장 최근 날짜)
    rows.forEach(r => { if (!hiRow || r.close >= hiRow.close) hiRow = r; if (!loRow || r.close <= loRow.close) loRow = r; });
    return { rows, avg, hi: hiRow ? hiRow.close : null, lo: loRow ? loRow.close : null, hiRow, loRow };
  }

  let lastNow = null;
  async function marketSection() {
    const el = document.getElementById('mkt-sec');
    if (!el) return;
    const p = CHART_PERIODS.find(x => x[0] === fxPeriod); // 위쪽 버튼도 1주~10년 + 최대
    el.innerHTML = `
      <div class="sec-hd"><h2>지표별 추이 <span class="muted small">· 주식 · 공포·탐욕 · 금·비트코인 · 변동성 · 환율·달러 · 유가 · 금리 · 김치 프리미엄 · BTC 도미넌스 · 구리/금 · 금/은 · KB 선도50 · PIR</span></h2>
        <div class="seg" role="group" aria-label="평균 기간">${CHART_PERIODS.map(([k, l]) => `<button type="button" data-fxp="${k}" class="${k === fxPeriod ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${MARKETS.map(m => `<div class="card pad mkt-card" id="mkt-${m.id}"><div class="muted small">불러오는 중…</div></div>`).join('')}`;
    el.querySelectorAll('[data-fxp]').forEach(b => b.onclick = () => {
      fxPeriod = b.dataset.fxp;
      try { localStorage.setItem(FX_KEY, fxPeriod); } catch (e) { /* 무시 */ }
      MARKETS.forEach(m => setChartPeriod(m, null)); // 위쪽 버튼 = 모든 차트를 같은 기간으로 (차트별 선택 해제)
      marketSection();
    });
    lastNow = await DataService.getFxRate();
    await Promise.all(MARKETS.map(m => marketPanel(m, p).catch(e => {
      const box = document.getElementById('mkt-' + m.id);
      if (box) box.innerHTML = `<h3 class="sec-sub" style="margin-top:0">${m.title}</h3><div class="notice">불러오지 못했습니다: ${esc(e.message)}</div>`;
    })));
  }

  // 이동평균 체크박스: 차트 오른쪽 위에 작게 고정
  function maPicker(m, sel) {
    const box = (key, label, color) => `<label class="ma-pick"><input type="checkbox" data-ma="${key}" ${sel.includes(key) ? 'checked' : ''}><span class="ma-swatch" style="background:${color}"></span>${label}</label>`;
    return `<div class="ma-picks"><button type="button" class="ma-cfg" data-ma-cfg title="이동평균 종류 고르기 · 원하는 기간과 색으로 추가">⚙ 설정</button><span class="ma-title">이동평균</span>
      ${maOpts(m).filter(([k]) => sel.includes(k)).map(([k, l, , c]) => box(k, l, c)).join('')}
      ${m.band && sel.includes('band') ? box('band', '200일 ±1%', BAND) : ''}${sel.length ? '' : '<span class="muted">없음</span>'}</div>`;
  }

  // [⚙ 설정] 팝업: 지금 고른 이동평균을 체크박스로 보여 주고(선 두께 1~10 선택), 원하는 기간(숫자 + 일·개월·년)과 색(#RRGGBB)으로 새 이동평균 추가
  //   차트 위 [⚙ 설정] 오른쪽에는 체크한 이동평균만 보임
  //   [적용]을 눌러야 저장 (이 차트에만, 이 브라우저에 기억). 이동평균마다 [삭제] (기본 5일~5년도 지울 수 있고, [기본 이동평균 되살리기]로 다시 보임)
  const MA_PALETTE = ['#0ea5e9', '#a855f7', '#ef4444', '#22c55e', '#f97316', '#14b8a6', '#e11d48', '#64748b', '#84cc16', '#6366f1'];
  function maDialog(m, done) {
    let custom = maCustom(m);
    let sel = maSelected(m).filter(k => k === 'band' || maOpts(m).some(o => o[0] === k));
    let hidden = maHidden(m);
    let colors = { ...maColors(m) }; // 색 바꾸기 (키 → #RRGGBB)
    const opts = () => colored(optsOf(custom, hidden), colors);
    const nextColor = () => MA_PALETTE.find(c => !opts().some(o => o[3].toLowerCase() === c)) || MA_PALETTE[custom.length % MA_PALETTE.length];
    let widths = { ...maWidths(m) }; // 선 두께 (키 → 1~10, 없으면 기본)
    const wSel = k => `<select class="inline ma-w" data-w="${k}" title="선 두께 (1 = 가장 가늘게, 10 = 가장 굵게)">
        <option value="">두께 기본</option>${Array.from({ length: 10 }, (_, i) => i + 1).map(v => `<option value="${v}" ${Number(widths[k]) === v ? 'selected' : ''}>두께 ${v}</option>`).join('')}</select>`;
    const list = () => opts().map(([k, l, , c]) => {
      const mine = custom.some(x => x[0] === k);
      return `<div class="ma-row"><label class="check"><input type="checkbox" data-k="${k}" ${sel.includes(k) ? 'checked' : ''}>
        <span class="ma-swatch" style="background:${c}"></span>${l} 평균${mine ? ' <span class="muted small">(추가)</span>' : ''}</label>
        <span class="ma-row-r"><input type="color" class="ma-col" data-color="${k}" value="${c}" title="선 색 고르기">${wSel(k)}<button type="button" class="btn btn-sm btn-ghost-danger" data-del="${k}" title="이 차트에서 이 이동평균을 지웁니다">삭제</button></span></div>`;
    }).join('') + (m.band ? `<div class="ma-row"><label class="check"><input type="checkbox" data-k="band" ${sel.includes('band') ? 'checked' : ''}>
        <span class="ma-swatch" style="background:${BAND}"></span>200일 ±1% 띠</label><span class="ma-row-r">${wSel('band')}</span></div>` : '')
      + (hidden.length ? `<div class="ma-row"><button type="button" class="btn btn-sm" data-restore title="지운 기본 이동평균(${hidden.map(k => (MA_OPTS.find(o => o[0] === k) || [k, k])[1]).join(', ')})을 목록에 다시 넣습니다">기본 이동평균 되살리기 (${hidden.length}개)</button></div>` : '');
    const color0 = nextColor();
    const dlg = App.modal({
      title: `이동평균 설정 — ${esc(m.title.split(' · ')[0])}`,
      body: `<div class="form">
        <div class="small muted">체크한 이동평균을 차트에 그립니다. 일 = 최근 n개 자료(거래일) 평균, 개월·년 = 날짜마다 그 기간 전까지의 평균.</div>
        <div id="ma-list" class="ma-list">${list()}</div>
        <div class="field"><label>이동평균 추가</label>
          <div class="toolbar">
            <input type="text" id="ma-n" inputmode="numeric" placeholder="숫자 (예: 60)" style="width:110px" autocomplete="off">
            <select id="ma-u" class="inline"><option value="n">일</option><option value="m">개월</option><option value="y">년</option></select>
            <input type="text" id="ma-c" value="${color0}" placeholder="#RRGGBB" style="width:100px" maxlength="7" autocomplete="off" title="색: #과 6자리 (예: #0ea5e9)">
            <input type="color" id="ma-cp" value="${color0}" title="색 고르기" style="width:36px;height:32px;padding:0;border:0;background:none">
            <button type="button" class="btn btn-sm btn-primary" id="ma-add">추가</button>
          </div></div>
        <div class="notice" id="ma-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '적용', kind: 'primary', onClick: api => {
          sel = [...api.body.querySelectorAll('[data-k]:checked')].map(x => x.dataset.k);
          saveMaCustom(m, custom);
          saveMaHidden(m, hidden);
          saveMa(m, sel);
          api.body.querySelectorAll('[data-w]').forEach(x => { if (x.value) widths[x.dataset.w] = Number(x.value); else delete widths[x.dataset.w]; });
          Object.keys(widths).forEach(k => { if (k !== 'band' && !opts().some(o => o[0] === k)) delete widths[k]; }); // 지운 이동평균의 두께는 정리
          saveMaWidths(m, widths);
          Object.keys(colors).forEach(k => { if (!opts().some(o => o[0] === k)) delete colors[k]; }); // 지운 이동평균의 색은 정리
          saveMaColors(m, colors);
          api.close();
          done();
        }
      }]
    });
    const body = dlg.body;
    const err = msg => { const e = body.querySelector('#ma-err'); e.hidden = !msg; e.textContent = msg || ''; };
    const redraw = () => {
      body.querySelectorAll('[data-w]').forEach(x => { if (x.value) widths[x.dataset.w] = Number(x.value); else delete widths[x.dataset.w]; }); // 다시 그려도 고른 두께 유지
      sel = [...body.querySelectorAll('[data-k]:checked')].map(x => x.dataset.k).concat(sel.filter(k => !body.querySelector(`[data-k="${k}"]`)));
      body.querySelector('#ma-list').innerHTML = list();
      bindDel();
    };
    const bindDel = () => body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const k = b.dataset.del;
      if (custom.some(x => x[0] === k)) custom = custom.filter(x => x[0] !== k); else if (!hidden.includes(k)) hidden = [...hidden, k]; // 기본 이동평균은 숨김 목록으로
      sel = sel.filter(x => x !== k);
      body.querySelector(`[data-k="${b.dataset.del}"]`).checked = false; redraw();
    });
    bindDel();
    // 선 색 고르기: 바로 옆 색 표시도 같이 바뀜 (적용을 눌러야 저장)
    body.addEventListener('input', e => { const ci = e.target.closest('[data-color]'); if (!ci) return; colors[ci.dataset.color] = ci.value; const sw = ci.closest('.ma-row').querySelector('.ma-swatch'); if (sw) sw.style.background = ci.value; });
    // [기본 이동평균 되살리기]: 지운 기본 이동평균을 목록에 다시 넣음 (체크는 꺼진 채로)
    body.addEventListener('click', e => { if (e.target.closest('[data-restore]')) { hidden = []; redraw(); } });
    const cText = body.querySelector('#ma-c'), cPick = body.querySelector('#ma-cp');
    cPick.oninput = () => { cText.value = cPick.value; };
    cText.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(cText.value.trim())) cPick.value = cText.value.trim(); };
    body.querySelector('#ma-add').onclick = () => {
      const n = Number(body.querySelector('#ma-n').value.replace(/[,\s]/g, ''));
      const u = body.querySelector('#ma-u').value;
      const c = cText.value.trim().toLowerCase();
      if (!Number.isInteger(n) || n < (u === 'n' ? 2 : 1) || n > (u === 'n' ? 5000 : u === 'm' ? 600 : 50)) return err(u === 'n' ? '일수는 2~5000 사이 정수로 입력하세요.' : u === 'm' ? '개월은 1~600 사이 정수로 입력하세요.' : '년은 1~50 사이 정수로 입력하세요.');
      if (!/^#[0-9a-f]{6}$/.test(c)) return err('색은 # 다음에 0~9, a~f 6자리로 입력하세요 (예: #0ea5e9).');
      const months = u === 'y' ? n * 12 : n;
      const key = u === 'n' ? 'n' + n : 'ym' + months;
      // 같은 기간이 이미 있으면 추가하지 않음 (기본 1년·3년·5년 = 12·36·60개월 포함)
      const same = opts().find(o => o[0] === key || (u !== 'n' && o[0][0] === 'y' && o[2] === months));
      if (same) return err(`${same[1]} 평균이 이미 있습니다. 목록에서 체크하세요.`);
      const label = u === 'n' ? `${n}일` : u === 'y' ? `${n}년` : months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
      custom.push([key, label, u === 'n' ? n : months, c]);
      if (!sel.includes(key)) sel.push(key);
      err('');
      body.querySelector('#ma-n').value = '';
      redraw();
      body.querySelector(`[data-k="${key}"]`).checked = true;
      const nc = nextColor(); cText.value = nc; cPick.value = nc;
    };
  }

  // 차트별 표시 기간: 위쪽 버튼과 같은 목록(1주~10년) + '최대'(저장된 전체). 고르면 그 차트만 바뀌고 이 브라우저에 기억
  const CHART_PERIODS = [...FX_PERIODS, ['MAX', '최대', null]];
  const CP_KEY = id => 'myAsset.market.period.' + id;
  function chartPeriod(m) {
    try { const s = localStorage.getItem(CP_KEY(m.id)); return CHART_PERIODS.find(x => x[0] === s) || null; } catch (e) { return null; }
  }
  function setChartPeriod(m, key) { try { key ? localStorage.setItem(CP_KEY(m.id), key) : localStorage.removeItem(CP_KEY(m.id)); } catch (e) { /* 무시 */ } }

  // 한 영역(카드) 그리기: 제목 + 차트별 기간 버튼 · 위쪽 숫자 칸 + 이동평균 체크박스 + 차트
  async function marketPanel(m, pTop) {
    const own = chartPeriod(m), p = own || pTop;
    const pName = p[0] === 'MAX' ? '전체 기간' : p[1];
    const SRC = { GOOGLE: 'Google Finance', ER_API: 'open.er-api.com', MOCK: '예시 환율', CSV: 'Investing.com', YAHOO: 'Yahoo Finance', TREASURY: '미 재무부', UPBIT: '업비트', NAVER: '네이버 금융', KB: 'KB부동산', FRED: 'FRED', CNN: 'CNN', CALC: '계산값' };
    const now = lastNow || await DataService.getFxRate();
    const data = await Promise.all(m.series.map(async s => {
      const hist = s.derive ? await s.derive() : await DataService.getFxHistory(s.pair);
      const lastRow = hist[hist.length - 1];
      const cur = s.live ? { v: now.rate, note: `${SRC[now.source] || now.source} · ${Fmt.mdhm(now.as_of)} 기준` }
        : lastRow ? { v: lastRow.close, note: `${lastRow.date} 종가 · ${SRC[lastRow.source] || lastRow.source}` } : null;
      return { s, hist, c: seriesCalc(hist, p), cur };
    }));
    const box = document.getElementById('mkt-' + m.id);
    if (!box) return;
    if (!data.some(d => d.hist.length)) { box.innerHTML = `<h3 class="sec-sub" style="margin-top:0">${m.title}</h3><div class="muted">데이터 없음</div>`; return; }
    const sel = maSelected(m);
    const pct = (a, b) => (a / b - 1) * 100;

    // 위쪽 칸 (모든 지표 같은 4칸, 선이 여럿이면 선마다 한 줄):
    //   현재 · 전일(전월·전분기) 대비 등락 · 고른 기간 평균(= 그 기간 이동평균) · 현재 − 기간 평균
    // diffAbs(금리·스프레드·김치 프리미엄 등 % 단위 지표): 등락과 차이를 %가 아니라 %p 로
    const unitStep = m.quarterly ? '전분기' : m.monthly ? '전월' : '전일';
    const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '');
    const pp = v => ppFmt(v).replace('%', '%p');
    const stats = data.map(({ s, hist, c, cur }) => {
      const name = m.series.length > 1 ? `${s.label} ` : '';
      // 비교할 직전 값: 실시간 값(환율)은 오늘 날짜가 아닌 마지막 종가, 그 밖은 마지막 바로 앞 자료
      const today = Fmt.todayKST();
      const prevRow = s.live ? [...hist].reverse().find(r => r.date < today) : hist[hist.length - 2];
      const chg = cur && prevRow ? (m.diffAbs ? cur.v - prevRow.close : pct(cur.v, prevRow.close)) : null;
      const diff = c.avg && cur ? (m.diffAbs ? cur.v - c.avg : pct(cur.v, c.avg)) : null;
      return `<div class="fx-stats four">
        <div><div class="stat-t"><span class="dot" style="background:${s.color}"></span>${name}현재</div><div class="stat-v">${cur ? m.fmt(cur.v) : '—'}${cur && m.grade ? ` <span class="grade">${m.grade(cur.v)}</span>` : ''}</div>
          <div class="stat-sub">${cur ? cur.note : '데이터 없음'}</div>${m.gradeNote ? `<div class="stat-sub">${m.gradeNote}</div>` : ''}</div>
        <div><div class="stat-t">${name}${unitStep} 대비</div><div class="stat-v">${chg == null ? '—' : `<span class="${Fmt.cls(chg, 'PCT')}">${m.diffAbs ? pp(chg) : `${Fmt.pct(chg)} <span class="chg-abs">(${signed(cur.v - prevRow.close)}${m.fmt(Math.abs(cur.v - prevRow.close))})</span>`}</span>`}</div>
          <div class="stat-sub">${chg == null ? '' : `${prevRow.date} ${m.fmt(prevRow.close)}에서`}</div></div>
        <div><div class="stat-t">${name}${pName} 평균</div><div class="stat-v">${c.avg ? m.fmt(c.avg) : '—'}</div>
          <div class="stat-sub">${c.rows.length ? `${c.rows[0].date} ~ ${c.rows[c.rows.length - 1].date} · ${c.rows.length}${m.quarterly ? '개 분기' : m.monthly ? '개월' : m.everyDay ? '일' : '거래일'} 평균` : '데이터 없음'}</div></div>
        <div><div class="stat-t">${name}현재 − ${pName} 평균</div><div class="stat-v">${diff == null ? '—' : `<span class="${Fmt.cls(diff, 'PCT')}">${m.diffAbs ? pp(diff) : Fmt.pct(diff)}</span>`}</div>
          <div class="stat-sub">${diff == null || m.diffAbs ? '' : `${signed(cur.v - c.avg)}${m.fmt(Math.abs(cur.v - c.avg))}`}</div></div>
      </div>`;
    }).join('');

    const unit = m.everyDay ? '날짜(주말 포함)' : '거래일';
    const firstDate = data.map(d => d.hist[0] && d.hist[0].date).filter(Boolean).sort()[0] || m.since; // 실제로 저장된 가장 오래된 날짜
    box.innerHTML = `<div class="mkt-hd"><h3 class="sec-sub" style="margin:0">${m.title}</h3>
        <div class="seg seg-sm" role="group" aria-label="이 차트의 기간" title="이 차트만 기간을 바꿉니다 (위쪽 기간 버튼을 누르면 모든 차트가 다시 같은 기간)">${CHART_PERIODS.map(([k, l]) => `<button type="button" data-cp="${k}" class="${k === p[0] ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${stats}
      <div class="chart-box ma-chart" style="height:300px">${maPicker(m, sel)}<canvas id="ch-${m.id}"></canvas></div>
      <p class="small muted" style="margin:6px 0 0">${m.quarterly ? `분기 자료 (${firstDate}부터 저장, 분기마다 자동 추가, 날짜 = 분기 마지막 달) · n일 이동평균 = 최근 n개 분기 평균` : m.monthly ? `월간 자료 (${firstDate}부터 저장, 매달 자동 추가) · n일 이동평균 = 최근 n개월 평균` : `일별 종가 (${firstDate}부터 저장, ${m.everyDay ? '매일' : '평일마다'} 자동 추가) · n일 = 최근 n${m.everyDay ? '일' : '거래일'} 평균 (${unit} 기준)`} · 1년·3년·5년 = 날짜마다 그 날부터 그 기간 전까지의 평균 · 자료가 기간보다 짧은 날은 그리지 않음${m.series.length > 1 ? `· ${m.series[1].label} 이동평균은 짧은 점선` : ''}${m.zero ? ' · 회색 점선 = 0' : ''}</p>`;
    // 경고: 현재 값이 체크한 이동평균선(가장 최근 값) 아래이면 카드 테두리를 빨갛게 깜빡임 (alertAbove 지표는 위일 때)
    const below = [];
    data.forEach(({ s, hist, cur }) => {
      if (!cur || !hist.length) return;
      if (m.alertWhen) { const msg = m.alertWhen(cur.v); if (msg) below.push(msg); return; } // 이동평균 대신 정해진 조건으로만 깜빡임
      maOpts(m).filter(o => sel.includes(o[0])).forEach(([k, l]) => {
        const v = maValues(hist, k, m)[hist.length - 1];
        if (v != null && (m.alertAbove ? cur.v > v : cur.v < v)) below.push(`${m.series.length > 1 ? s.label + ' ' : ''}현재 ${m.fmt(cur.v)} ${m.alertAbove ? '>' : '<'} ${l} 평균 ${m.fmt(v)}`);
      });
    });
    box.classList.toggle('ma-below', below.length > 0);
    box.title = below.length ? (m.alertWhen ? '' : m.alertAbove ? '이동평균선 위: ' : '이동평균선 아래: ') + below.join(' · ') : '';
    box.querySelectorAll('[data-ma]').forEach(cb => cb.onchange = () => {
      const next = [...box.querySelectorAll('[data-ma]:checked')].map(x => x.dataset.ma);
      saveMa(m, next);
      marketPanel(m, pTop);
    });
    box.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => {
      setChartPeriod(m, b.dataset.cp);
      marketPanel(m, pTop);
    });
    box.querySelector('[data-ma-cfg]').onclick = () => maDialog(m, () => marketPanel(m, pTop));

    // 차트: 여러 지표(WTI·브렌트유)는 날짜를 합쳐 한 차트에 그림
    const labels = [...new Set(data.flatMap(d => d.c.rows.map(r => r.date)))].sort();
    if (!labels.length) return;
    const onLabels = (hist, vals) => { const mp = {}; hist.forEach((r, i) => { mp[r.date] = vals[i]; }); return labels.map(d => (d in mp ? mp[d] : null)); };
    const datasets = [];
    data.forEach(({ s, hist, c }, si) => {
      const multi = m.series.length > 1;
      datasets.push({ label: s.label, data: onLabels(hist, hist.map(r => r.close)), borderColor: s.color, backgroundColor: s.color, borderWidth: 1.8, pointRadius: labels.length <= 31 ? 2 : 0, tension: 0.1, spanGaps: true });
      // 선택 기간 안의 최고 · 최저 지점 표시 (값 · 날짜는 EXTREME_LABELS 플러그인이 글자로 그림)
      if (c.hiRow && c.loRow) datasets.push({ label: '', data: labels.map(d => (d === c.hiRow.date ? c.hiRow.close : d === c.loRow.date ? c.loRow.close : null)), showLine: false,
        pointRadius: 4, pointHoverRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: s.color, pointBorderWidth: 2, extremes: { hi: c.hiRow, lo: c.loRow, multi: m.series.length > 1 ? s.label + ' ' : '' } });
      maOpts(m).filter(o => sel.includes(o[0])).forEach(([k, l, , color]) => {
        datasets.push({ label: `${multi ? s.label + ' ' : ''}${l} 평균`, data: onLabels(hist, maValues(hist, k, m)), borderColor: color, borderWidth: maWidth(m, k, 1.4),
          borderDash: si > 0 ? [2, 3] : (k[0] === 'y' ? [6, 4] : []), pointRadius: 0, tension: 0.1, spanGaps: true });
      });
      if (m.band && sel.includes('band')) {
        const m200 = smaN(hist, 200);
        [['+1%', 1.01], ['−1%', 0.99]].forEach(([t, f]) => datasets.push({ label: `200일 ${t}`, data: onLabels(hist, m200.map(v => (v == null ? null : v * f))), borderColor: BAND, borderWidth: maWidth(m, 'band', 1.1), borderDash: [3, 3], pointRadius: 0, tension: 0.1, spanGaps: true }));
      }
    });
    if (m.zero) datasets.push({ label: '', data: labels.map(() => 0), borderColor: '#9aa5b1', borderWidth: 1, borderDash: [2, 2], pointRadius: 0 }); // 0 기준선
    UI.chart('ch-' + m.id, {
      type: 'line',
      data: { labels, datasets },
      plugins: [EXTREME_LABELS(m.fmt)],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 26 } }, // 오른쪽 위 체크박스 자리
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2, filter: it => it.text !== '' } },
          tooltip: { callbacks: { label: ctx => (ctx.parsed.y == null || !ctx.dataset.label ? null : `${ctx.dataset.label}: ${m.fmt(ctx.parsed.y)}`) } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { const d = this.getLabelForValue(v); return labels.length > 400 || m.monthly ? d.slice(0, 7) : Fmt.md(d); } }, grid: { display: false } },
          y: { grace: '10%', ticks: { callback: m.tick }, grid: { color: '#eef1f5' } } // grace: 최고 · 최저 글자가 들어갈 위아래 여백
        }
      }
    });
  }

  // 차트 플러그인: 최고 · 최저 지점 옆에 '최고 값 (날짜)' · '최저 값 (날짜)' 글자를 그림
  function EXTREME_LABELS(fmt) {
    return {
      id: 'extremeLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: a } = chart;
        chart.data.datasets.forEach((ds, i) => {
          if (!ds.extremes || !chart.isDatasetVisible(i)) return;
          const meta = chart.getDatasetMeta(i);
          [['hi', '최고', -9], ['lo', '최저', 16]].forEach(([k, name, dy]) => {
            const row = ds.extremes[k], idx = chart.data.labels.indexOf(row.date), pt = meta.data[idx];
            if (!pt) return;
            const x = pt.x, text = `${ds.extremes.multi}${name} ${fmt(row.close)} (${row.date})`;
            ctx.save();
            ctx.font = '600 11px sans-serif';
            ctx.textAlign = x > a.right - 110 ? 'right' : x < a.left + 110 ? 'left' : 'center';
            ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.fillStyle = k === 'hi' ? '#dc2626' : '#2457d6';
            ctx.strokeText(text, x, pt.y + dy); ctx.fillText(text, x, pt.y + dy);
            ctx.restore();
          });
        });
      }
    };
  }

  async function render() {
    document.getElementById('main').innerHTML = `
      <div class="page-hd">
        <div><h1>시장 지표</h1><p class="desc">주요 ETF·비트코인·환율·달러 인덱스·유가의 추이와 이동평균을 봅니다. 위쪽 기간 버튼은 차트에 보이는 구간을, 차트마다 있는 체크박스는 그릴 이동평균을 고릅니다.</p></div>
      </div>
      <div class="sec" id="mkt-sec"></div>`;
    marketSection();
  }

  App.init('market', render);
})();
