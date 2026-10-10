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
    { id: 'gld', sma: true, title: 'GLD (금 ETF)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'GLD', label: 'GLD', color: PRICE }] },
    // 비트코인은 주말에도 거래 → 매일 저장, n일선도 달력 날짜 기준
    { id: 'btc', sma: true, everyDay: true, title: '비트코인 (BTC/USD)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'BTC', label: 'BTC', color: PRICE }] },
    // VIX: 미국 S&P500 옵션으로 계산한 '공포 지수' (변동성). 단위 없음 — 위쪽 칸은 현재 · 기간 평균
    { id: 'vix', title: 'VIX (CBOE 변동성 지수)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['n50', 'n200'],
      series: [{ pair: 'VIX', label: 'VIX', color: PRICE }] },
    { id: 'fx', title: 'USD/KRW 환율', fmt: fx2, tick: v => '₩' + Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'USD/KRW', label: 'USD/KRW', color: PRICE, live: true }] },
    { id: 'dxy', title: '달러 인덱스 (DXY)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'DXY', label: '달러 인덱스', color: PRICE }] },
    { id: 'oil', title: '국제 유가 (WTI · 브렌트유, 달러/배럴)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'WTI', label: 'WTI유', color: PRICE }, { pair: 'BRENT', label: '브렌트유', color: PRICE2 }] },
    // 금리·스프레드는 '현재 − 평균'을 %가 아니라 차이(%p)로 보여 줌 (diffAbs)
    { id: 'ust', title: '미국 국채금리 (10년 · 2년, %)', fmt: pctFmt, tick: v => v + '%', since: '2016-10-11', ma: [], diffAbs: true, unitSrc: '미 재무부 공식 금리',
      series: [{ pair: 'UST10Y', label: '10년물', color: PRICE }, { pair: 'UST2Y', label: '2년물', color: PRICE2 }] },
    { id: 'spread', title: '장단기 금리차 (미국 10년 − 2년, %p) · 0 아래 = 금리 역전(경기침체 신호)', fmt: ppFmt, tick: v => v + '%p', since: '2016-10-11', ma: [], diffAbs: true, zero: true,
      series: [{ pair: 'UST10Y2Y', label: '10년 − 2년', color: PRICE }] },
    { id: 'kimchi', title: '김치 프리미엄 (비트코인, %) · 업비트 원화 시세 ÷ (달러 시세 × 환율) − 1', fmt: ppFmt, tick: v => v + '%', since: '2017-09-25', ma: ['n20'], diffAbs: true, zero: true, everyDay: true,
      series: [{ pair: 'KIMCHI', label: '김치 프리미엄', color: PRICE, derive: kimchiHistory }] },
    { id: 'cugold', title: '구리 / 금 가격 비율 (×1000) · 오르면 경기 기대, 내리면 안전자산 선호', fmt: v => Number(v).toFixed(3), tick: v => Number(v).toFixed(2), since: '2016-10-11', ma: ['n200'],
      series: [{ pair: 'CUGOLD', label: '구리/금', color: PRICE, derive: copperGoldHistory }] },
    { id: 'ausilver', title: '금 / 은 가격 비율 · 금 1온스로 살 수 있는 은의 온스 · 높으면 은이 상대적으로 쌈', fmt: dec2, tick: v => Number(v).toFixed(0), since: '2000-08-30', ma: ['n200'],
      series: [{ pair: 'AUAG', label: '금/은', color: PRICE, derive: goldSilverHistory }] },
    { id: 'kr3y', title: '한국 국채 3년 (%)', fmt: pctFmt, tick: v => v + '%', since: '2023-10-11', ma: [], diffAbs: true,
      series: [{ pair: 'KR3Y', label: '국채 3년', color: PRICE }] },
    { id: 'kb50', title: 'KB 선도아파트 50 지수 (월간, 2008-12~)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2008-12', ma: ['y1'], monthly: true,
      series: [{ pair: 'KB_LEAD50', label: 'KB 선도50', color: PRICE }] },
    // PIR = 아파트 가격 ÷ 연소득 (KB 아파트담보대출 기준, 중간값) → 소득을 한 푼도 안 쓰고 몇 년 모아야 집을 사는지
    { id: 'pir', title: '소득 대비 주택가격 PIR (KB 아파트담보대출, 배 · 분기, 2008~) · 연소득을 몇 년 모아야 아파트를 사는지', fmt: v => dec2(v) + '배', tick: v => v + '배', since: '2008-03', ma: [], monthly: true, quarterly: true,
      series: [{ pair: 'KB_PIR_SEOUL', label: '서울', color: PRICE }, { pair: 'KB_PIR_GG', label: '경기', color: PRICE2 }] }
  ];
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
  const maValues = (hist, key) => { const o = MA_OPTS.find(x => x[0] === key); return key[0] === 'n' ? smaN(hist, o[2]) : smaMonths(hist, o[2]); };

  // 표시 구간(기간 버튼)의 자료 + 기간 단순 평균·최고·최저
  function seriesCalc(hist, p) {
    const startOf = d => (p[0] === 'MAX' ? '0000-00-00' : p[0] === '1W' ? Fmt.addDays(d, -p[2]) : monthsBack(d, p[2]));
    const last = hist.length ? hist[hist.length - 1].date : Fmt.todayKST();
    const rows = hist.filter(r => r.date > startOf(last));
    const avg = rows.length ? rows.reduce((s, r) => s + r.close, 0) / rows.length : null;
    return { rows, avg, hi: rows.length ? Math.max(...rows.map(r => r.close)) : null, lo: rows.length ? Math.min(...rows.map(r => r.close)) : null };
  }

  let lastNow = null;
  async function marketSection() {
    const el = document.getElementById('mkt-sec');
    if (!el) return;
    const p = CHART_PERIODS.find(x => x[0] === fxPeriod); // 위쪽 버튼도 1주~10년 + 최대
    el.innerHTML = `
      <div class="sec-hd"><h2>지표별 추이 <span class="muted small">· 주식·금·비트코인 · 변동성 · 환율·달러 · 유가 · 금리 · 김치 프리미엄 · 구리/금 · 금/은 · KB 선도50 · PIR</span></h2>
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
    return `<div class="ma-picks"><span class="ma-title">이동평균</span>
      ${MA_OPTS.map(([k, l, , c]) => box(k, l, c)).join('')}
      ${m.band ? box('band', '200일 ±1%', BAND) : ''}</div>`;
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
    const SRC = { GOOGLE: 'Google Finance', ER_API: 'open.er-api.com', MOCK: '예시 환율', CSV: 'Investing.com', YAHOO: 'Yahoo Finance', TREASURY: '미 재무부', UPBIT: '업비트', NAVER: '네이버 금융', KB: 'KB부동산', FRED: 'FRED', CALC: '계산값' };
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

    let stats;
    if (m.sma) {
      // QQQ · SPY · GLD · 비트코인: 현재 · 50일선 · 200일선 · 현재 − 200일선
      const { s, hist } = data[0];
      const L = hist.length - 1, last = hist[L];
      const ma50 = smaN(hist, 50)[L], ma200 = smaN(hist, 200)[L];
      const d200 = ma200 ? pct(last.close, ma200) : null;
      const zone = d200 == null ? '' : d200 >= 1 ? '200일선 +1% 이상' : d200 <= -1 ? '200일선 −1% 이하' : '200일선 ±1% 사이';
      stats = `<div class="fx-stats four">
        <div><div class="stat-t"><span class="dot" style="background:${s.color}"></span>현재</div><div class="stat-v">${m.fmt(last.close)}</div>
          <div class="stat-sub">${last.date} 종가 · ${SRC[last.source] || last.source}</div></div>
        <div><div class="stat-t">50일선</div><div class="stat-v">${ma50 ? m.fmt(ma50) : '—'}</div>
          <div class="stat-sub">${ma50 ? `현재 − 50일선 <span class="${Fmt.cls(pct(last.close, ma50), 'PCT')}">${Fmt.pct(pct(last.close, ma50))}</span>` : ''}</div></div>
        <div><div class="stat-t">200일선</div><div class="stat-v">${ma200 ? m.fmt(ma200) : '—'}</div>
          <div class="stat-sub">${ma200 && m.band ? `+1% ${m.fmt(ma200 * 1.01)} / −1% ${m.fmt(ma200 * 0.99)}` : ''}</div></div>
        <div><div class="stat-t">현재 − 200일선</div><div class="stat-v">${d200 == null ? '—' : `<span class="${Fmt.cls(d200, 'PCT')}">${Fmt.pct(d200)}</span>`}</div>
          <div class="stat-sub">${m.band ? zone : ''}</div></div>
      </div>`;
    } else {
      // 환율 · 달러 인덱스 · 유가: 현재 · 기간 평균 · 현재 − 기간 평균 (지표마다 한 줄)
      stats = data.map(({ s, c, cur }) => {
        const diffPct = c.avg && cur ? (m.diffAbs ? cur.v - c.avg : pct(cur.v, c.avg)) : null; // diffAbs: 차이(단위 그대로)
        const name = m.series.length > 1 ? `${s.label} ` : '';
        return `<div class="fx-stats">
          <div><div class="stat-t"><span class="dot" style="background:${s.color}"></span>${name}현재</div><div class="stat-v">${cur ? m.fmt(cur.v) : '—'}</div>
            <div class="stat-sub">${cur ? cur.note : '데이터 없음'}</div></div>
          <div><div class="stat-t">${name}${pName} 평균</div><div class="stat-v">${c.avg ? m.fmt(c.avg) : '—'}</div>
            <div class="stat-sub">${c.rows.length ? `${c.rows[0].date} ~ ${c.rows[c.rows.length - 1].date} · ${c.rows.length}${m.quarterly ? '개 분기' : m.monthly ? '개월' : '거래일'} 평균` : '데이터 없음'}</div></div>
          <div><div class="stat-t">${name}현재 − ${pName} 평균</div><div class="stat-v">${diffPct == null ? '—' : `<span class="${Fmt.cls(diffPct, 'PCT')}">${m.diffAbs ? ppFmt(diffPct).replace('%', '%p') : Fmt.pct(diffPct)}</span>`}</div>
            <div class="stat-sub">${c.avg && cur ? `${cur.v >= c.avg ? '+' : '−'}${m.diffAbs ? dec2(Math.abs(cur.v - c.avg)) + '%p' : m.fmt(Math.abs(cur.v - c.avg))} · 기간 최고 ${m.fmt(c.hi)} / 최저 ${m.fmt(c.lo)}` : ''}</div></div>
        </div>`;
      }).join('');
    }

    const unit = m.everyDay ? '날짜(주말 포함)' : '거래일';
    const firstDate = data.map(d => d.hist[0] && d.hist[0].date).filter(Boolean).sort()[0] || m.since; // 실제로 저장된 가장 오래된 날짜
    box.innerHTML = `<div class="mkt-hd"><h3 class="sec-sub" style="margin:0">${m.title}</h3>
        <div class="seg seg-sm" role="group" aria-label="이 차트의 기간" title="이 차트만 기간을 바꿉니다 (위쪽 기간 버튼을 누르면 모든 차트가 다시 같은 기간)">${CHART_PERIODS.map(([k, l]) => `<button type="button" data-cp="${k}" class="${k === p[0] ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${stats}
      <div class="chart-box ma-chart" style="height:300px">${maPicker(m, sel)}<canvas id="ch-${m.id}"></canvas></div>
      <p class="small muted" style="margin:6px 0 0">${m.quarterly ? `분기 자료 (${firstDate}부터 저장, 분기마다 자동 추가, 날짜 = 분기 마지막 달) · n일 이동평균 = 최근 n개 분기 평균` : m.monthly ? `월간 자료 (${firstDate}부터 저장, 매달 자동 추가) · n일 이동평균 = 최근 n개월 평균` : `일별 종가 (${firstDate}부터 저장, ${m.everyDay ? '매일' : '평일마다'} 자동 추가) · n일 = 최근 n${m.everyDay ? '일' : '거래일'} 평균 (${unit} 기준)`} · 1년·3년·5년 = 날짜마다 그 날부터 그 기간 전까지의 평균 · 자료가 기간보다 짧은 날은 그리지 않음${m.series.length > 1 ? `· ${m.series[1].label} 이동평균은 짧은 점선` : ''}${m.zero ? ' · 회색 점선 = 0' : ''}</p>`;
    box.querySelectorAll('[data-ma]').forEach(cb => cb.onchange = () => {
      const next = [...box.querySelectorAll('[data-ma]:checked')].map(x => x.dataset.ma);
      saveMa(m, next);
      marketPanel(m, pTop);
    });
    box.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => {
      setChartPeriod(m, b.dataset.cp);
      marketPanel(m, pTop);
    });

    // 차트: 여러 지표(WTI·브렌트유)는 날짜를 합쳐 한 차트에 그림
    const labels = [...new Set(data.flatMap(d => d.c.rows.map(r => r.date)))].sort();
    if (!labels.length) return;
    const onLabels = (hist, vals) => { const mp = {}; hist.forEach((r, i) => { mp[r.date] = vals[i]; }); return labels.map(d => (d in mp ? mp[d] : null)); };
    const datasets = [];
    data.forEach(({ s, hist }, si) => {
      const multi = m.series.length > 1;
      datasets.push({ label: s.label, data: onLabels(hist, hist.map(r => r.close)), borderColor: s.color, backgroundColor: s.color, borderWidth: 1.8, pointRadius: labels.length <= 31 ? 2 : 0, tension: 0.1, spanGaps: true });
      MA_OPTS.filter(o => sel.includes(o[0])).forEach(([k, l, , color]) => {
        datasets.push({ label: `${multi ? s.label + ' ' : ''}${l} 평균`, data: onLabels(hist, maValues(hist, k)), borderColor: color, borderWidth: 1.4,
          borderDash: si > 0 ? [2, 3] : (k[0] === 'y' ? [6, 4] : []), pointRadius: 0, tension: 0.1, spanGaps: true });
      });
      if (m.band && sel.includes('band')) {
        const m200 = smaN(hist, 200);
        [['+1%', 1.01], ['−1%', 0.99]].forEach(([t, f]) => datasets.push({ label: `200일 ${t}`, data: onLabels(hist, m200.map(v => (v == null ? null : v * f))), borderColor: BAND, borderWidth: 1.1, borderDash: [3, 3], pointRadius: 0, tension: 0.1, spanGaps: true }));
      }
    });
    if (m.zero) datasets.push({ label: '', data: labels.map(() => 0), borderColor: '#9aa5b1', borderWidth: 1, borderDash: [2, 2], pointRadius: 0 }); // 0 기준선
    UI.chart('ch-' + m.id, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 26 } }, // 오른쪽 위 체크박스 자리
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2, filter: it => it.text !== '' } },
          tooltip: { callbacks: { label: ctx => (ctx.parsed.y == null || !ctx.dataset.label ? null : `${ctx.dataset.label}: ${m.fmt(ctx.parsed.y)}`) } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { const d = this.getLabelForValue(v); return labels.length > 400 || m.monthly ? d.slice(0, 7) : Fmt.md(d); } }, grid: { display: false } },
          y: { ticks: { callback: m.tick }, grid: { color: '#eef1f5' } }
        }
      }
    });
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
