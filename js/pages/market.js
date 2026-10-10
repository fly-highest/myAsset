// 시장 지표 (market.html) — QQQ · SPY · GLD · 비트코인 · USD/KRW 환율 · 달러 인덱스 · WTI/브렌트유
// 일별 종가는 DB fx_daily (과거 = 업로드한 CSV, 이후 = 매시 15분 자동 추가: Google Finance 우선, 안 되면 Yahoo)
// - 위쪽 기간 버튼(1주~5년): 차트에 보이는 구간 + 환율·달러 인덱스·유가의 '기간 평균' 칸
// - 차트마다 이동평균 체크박스: 5일 · 20일 · 50일 · 120일 · 200일 (자료 개수 기준) · 1년 · 3년 · 5년 (날짜 기준), QQQ 는 200일 ±1% 추가
(function () {
  const FX_PERIODS = [['1W', '1주', 7], ['1M', '1개월', 1], ['3M', '3개월', 3], ['1Y', '1년', 12], ['3Y', '3년', 36], ['5Y', '5년', 60]];
  const FX_KEY = 'myAsset.invest.fxPeriod';
  let fxPeriod = '1Y';
  try { const s = localStorage.getItem(FX_KEY); if (FX_PERIODS.some(p => p[0] === s)) fxPeriod = s; } catch (e) { /* 무시 */ }
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
    { id: 'fx', title: 'USD/KRW 환율', fmt: fx2, tick: v => '₩' + Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'USD/KRW', label: 'USD/KRW', color: PRICE, live: true }] },
    { id: 'dxy', title: '달러 인덱스 (DXY)', fmt: dec2, tick: v => Number(v).toLocaleString('ko-KR'), since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'DXY', label: '달러 인덱스', color: PRICE }] },
    { id: 'oil', title: '국제 유가 (WTI · 브렌트유, 달러/배럴)', fmt: usd, tick: usdTick, since: '2016-10-10', ma: ['y1'],
      series: [{ pair: 'WTI', label: 'WTI유', color: PRICE }, { pair: 'BRENT', label: '브렌트유', color: PRICE2 }] }
  ];

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
    const startOf = d => (p[0] === '1W' ? Fmt.addDays(d, -p[2]) : monthsBack(d, p[2]));
    const last = hist.length ? hist[hist.length - 1].date : Fmt.todayKST();
    const rows = hist.filter(r => r.date > startOf(last));
    const avg = rows.length ? rows.reduce((s, r) => s + r.close, 0) / rows.length : null;
    return { rows, avg, hi: rows.length ? Math.max(...rows.map(r => r.close)) : null, lo: rows.length ? Math.min(...rows.map(r => r.close)) : null };
  }

  let lastNow = null;
  async function marketSection() {
    const el = document.getElementById('mkt-sec');
    if (!el) return;
    const p = FX_PERIODS.find(x => x[0] === fxPeriod);
    el.innerHTML = `
      <div class="sec-hd"><h2>지표별 추이 <span class="muted small">· QQQ · SPY · GLD · 비트코인 · 환율 · 달러 인덱스 · 유가</span></h2>
        <div class="seg" role="group" aria-label="평균 기간">${FX_PERIODS.map(([k, l]) => `<button type="button" data-fxp="${k}" class="${k === fxPeriod ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${MARKETS.map(m => `<div class="card pad mkt-card" id="mkt-${m.id}"><div class="muted small">불러오는 중…</div></div>`).join('')}`;
    el.querySelectorAll('[data-fxp]').forEach(b => b.onclick = () => {
      fxPeriod = b.dataset.fxp;
      try { localStorage.setItem(FX_KEY, fxPeriod); } catch (e) { /* 무시 */ }
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

  // 한 영역(카드) 그리기: 위쪽 숫자 칸 + 이동평균 체크박스 + 차트
  async function marketPanel(m, p) {
    const SRC = { GOOGLE: 'Google Finance', ER_API: 'open.er-api.com', MOCK: '예시 환율', CSV: 'Investing.com', YAHOO: 'Yahoo Finance' };
    const now = lastNow || await DataService.getFxRate();
    const data = await Promise.all(m.series.map(async s => {
      const hist = await DataService.getFxHistory(s.pair);
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
        const diffPct = c.avg && cur ? pct(cur.v, c.avg) : null;
        const name = m.series.length > 1 ? `${s.label} ` : '';
        return `<div class="fx-stats">
          <div><div class="stat-t"><span class="dot" style="background:${s.color}"></span>${name}현재</div><div class="stat-v">${cur ? m.fmt(cur.v) : '—'}</div>
            <div class="stat-sub">${cur ? cur.note : '데이터 없음'}</div></div>
          <div><div class="stat-t">${name}${p[1]} 평균</div><div class="stat-v">${c.avg ? m.fmt(c.avg) : '—'}</div>
            <div class="stat-sub">${c.rows.length ? `${c.rows[0].date} ~ ${c.rows[c.rows.length - 1].date} · ${c.rows.length}거래일 종가 평균` : '데이터 없음'}</div></div>
          <div><div class="stat-t">${name}현재 − ${p[1]} 평균</div><div class="stat-v">${diffPct == null ? '—' : `<span class="${Fmt.cls(diffPct, 'PCT')}">${Fmt.pct(diffPct)}</span>`}</div>
            <div class="stat-sub">${c.avg && cur ? `${cur.v >= c.avg ? '+' : '−'}${m.fmt(Math.abs(cur.v - c.avg))} · 기간 최고 ${m.fmt(c.hi)} / 최저 ${m.fmt(c.lo)}` : ''}</div></div>
        </div>`;
      }).join('');
    }

    const unit = m.everyDay ? '날짜(주말 포함)' : '거래일';
    box.innerHTML = `<h3 class="sec-sub" style="margin-top:0">${m.title}</h3>
      ${stats}
      <div class="chart-box ma-chart" style="height:300px">${maPicker(m, sel)}<canvas id="ch-${m.id}"></canvas></div>
      <p class="small muted" style="margin:6px 0 0">일별 종가 (${m.since}부터 저장, ${m.everyDay ? '매일' : '평일마다'} 자동 추가) · n일 = 최근 n${m.everyDay ? '일' : '거래일'} 평균 (${unit} 기준) · 1년·3년·5년 = 날짜마다 그 날부터 그 기간 전까지의 평균 · 자료가 기간보다 짧은 날은 그리지 않음${m.series.length > 1 ? ' · 브렌트유 이동평균은 짧은 점선' : ''}</p>`;
    box.querySelectorAll('[data-ma]').forEach(cb => cb.onchange = () => {
      const next = [...box.querySelectorAll('[data-ma]:checked')].map(x => x.dataset.ma);
      saveMa(m, next);
      marketPanel(m, p);
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
    UI.chart('ch-' + m.id, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 26 } }, // 오른쪽 위 체크박스 자리
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2 } },
          tooltip: { callbacks: { label: ctx => (ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${m.fmt(ctx.parsed.y)}`) } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { const d = this.getLabelForValue(v); return labels.length > 400 ? d.slice(0, 7) : Fmt.md(d); } }, grid: { display: false } },
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
