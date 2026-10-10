// 투자 (invest.html) — 목표 비중 대비 현재 자산 현황과 매수·매도 필요 금액
//  ① 목표 행 (기준별): 총 평가금액 = 현재와 같음, 자산군별 금액 = 총 평가금액 × 목표 %
//  ② 현재 행: 자산 현황의 '현재 자산 현황'과 같은 값
//  ③ 매수·매도 행 (기준별): 목표 금액 − 현재 금액 (+ 매수 필요 / − 매도 필요), 비중은 목표 % − 현재 %
// 목표 비중은 계좌/자산관리 › 자산 구성 관리 › 목표 비중에서 수정합니다.
(function () {
  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const [ps, plans, sig] = await Promise.all([DataService.getPriceStatus(), DataService.getTargetPlans(), DataService.getQqqSignal()]);
    // 지금 해당하는 기준: 기본 기준(200일선 +1% 이상 / −1% 이하)과 QQQ 200일선 구간을 연결
    const activeId = sig ? { above: 'tgt-above', below: 'tgt-below' }[sig.zone] : null;
    // 목표 비교는 하나의 통화로 합산해야 하므로 혼합 모드는 원화 기준으로 보여 줍니다
    const mode = App.mode === 'USD' || (App.mode === 'GOLD' && model.gold) ? App.mode : 'KRW'; // 금환산도 지원
    const cur = mode === 'GOLD' ? 'XAU' : mode;
    const fx = model.fx;
    const conv = k => (cur === 'USD' ? (fx ? k / fx : 0) : cur === 'XAU' ? Calc.toGram(fx ? k / fx : 0, model.gold) : k); // 금: 원화 → 달러(지금 환율) → 금 g
    const totalK = model.total.valK;
    const curPct = code => (totalK ? (model.groups[code].agg.valK / totalK) * 100 : 0);
    const muted = '<span class="muted">—</span>';
    const gcell = (i, html, cls = '') => `<td class="num${i === 0 ? ' g-first' : ''}${cls ? ' ' + cls : ''}">${html}</td>`;
    const pp = v => (Math.round(v * 100) / 100 > 0 ? '+' : Math.round(v * 100) / 100 < 0 ? Fmt.MINUS : '') + Math.abs(v).toFixed(2) + '%p';

    // ① 목표 행
    const targetRows = plans.map(p => `<tr class="tgt-row${p.id === activeId ? ' active-plan' : ''}">
      <td class="nowrap sticky-col">${esc(p.name)} <span class="tag">목표</span>${p.id === activeId ? ' <span class="tag tag-active">현재 해당</span>' : ''}${p.sum !== 100 ? ` <span class="tag-warn" title="자산군 목표 비중 합계가 100%가 아닙니다">합계 ${p.sum}%</span>` : ''}</td>
      <td class="num">${Fmt.money(conv(totalK), cur)}</td><td class="num">${muted}</td><td class="num">${muted}</td><td class="num">${muted}</td>
      <td class="num">${Fmt.fx(fx || 0)}</td>
      ${Groups.list.map((g, i) => gcell(i, Fmt.money(conv(totalK * (p.weights[g.code] || 0) / 100), cur))).join('')}
      ${Groups.list.map((g, i) => gcell(i, Fmt.weight(p.weights[g.code] || 0))).join('')}
    </tr>`).join('');

    // ② 현재 행
    const v = Calc.view(model.total, mode, fx);
    const currentRow = `<tr class="cur-row">
      <td class="nowrap sticky-col"><b>현재</b> <span class="muted small">${ps.latestAsOf ? '시세 ' + Fmt.mdhm(ps.latestAsOf) : '예시 시세'}</span></td>
      <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v, { split: false })}</td><td class="num">${UI.ret(v)}</td>
      <td class="num">${Fmt.fx(fx || 0)}</td>
      ${Groups.list.map((g, i) => gcell(i, UI.amt(Calc.view(model.groups[g.code].agg, mode, fx), 'val'))).join('')}
      ${Groups.list.map((g, i) => gcell(i, Fmt.weight(curPct(g.code)))).join('')}
    </tr>`;

    // ③ 매수·매도 필요 금액 행 (목표 − 현재). 한국식 색상: 매수(+) 빨강, 매도(−) 파랑
    const diffRows = plans.map(p => {
      let buy = 0, sell = 0;
      const cells = Groups.list.map((g, i) => {
        const d = totalK * (p.weights[g.code] || 0) / 100 - model.groups[g.code].agg.valK;
        if (d > 0) buy += d; else sell -= d;
        const x = conv(d);
        const label = Math.abs(Math.round(x)) < (cur === 'USD' ? 0.01 : 1) ? '' : x > 0 ? '<div class="sub">매수</div>' : '<div class="sub">매도</div>';
        return gcell(i, `${Fmt.signedMoney(x, cur)}${label}`, Fmt.cls(x, cur));
      }).join('');
      const wcells = Groups.list.map((g, i) => {
        const d = (p.weights[g.code] || 0) - curPct(g.code);
        return gcell(i, pp(d), Fmt.cls(d, 'PCT'));
      }).join('');
      return `<tr class="diff-row">
        <td class="nowrap sticky-col">${esc(p.name)} <span class="tag tag-diff">매수·매도</span></td>
        <td class="num" colspan="5"><span class="small">매수 합계 <b class="pos">${Fmt.money(conv(buy), cur)}</b> · 매도 합계 <b class="neg">${Fmt.money(conv(sell), cur)}</b></span></td>
        ${cells}${wcells}
      </tr>`;
    }).join('');

    document.getElementById('main').innerHTML = `
      <div class="page-hd">
        <div><h1>투자</h1><p class="desc">기준별 목표 비중과 현재 자산을 비교해, 자산군별로 사거나 팔아야 할 금액을 보여 줍니다. 목표 비중은 <a href="manage.html#composition">계좌/자산관리 › 자산 구성 관리</a>에서 바꿀 수 있습니다.</p></div>
        <div class="toolbar"><a class="btn btn-sm" href="manage.html#composition">목표 비중 수정</a></div>
      </div>
      ${App.statusBar(status, { showSnapshot: false })}
      ${signalCard(sig)}
      <div class="sec">${UI.totalsCards(model.total, mode, fx)}</div>
      <div class="sec">
        <div class="sec-hd"><h2>목표 대비 현재 자산 현황</h2>
          <span class="small muted">목표 금액 = 현재 총 평가금액 × 목표 % · 매수·매도 = 목표 금액 − 현재 금액 (+ 매수 필요 / − 매도 필요)${App.mode === 'MIXED' ? ' · 혼합 모드에서는 원화 환산으로 비교합니다' : ''}</span></div>
        <div class="tbl-wrap now-wrap"><table class="tbl hist invest">
          <thead>
            <tr>
              <th rowspan="2" class="sticky-col">기준</th><th rowspan="2" class="num">총 평가금액</th><th rowspan="2" class="num">총 투자금액</th>
              <th rowspan="2" class="num">총 손익</th><th rowspan="2" class="num">총 수익률</th><th rowspan="2" class="num">환율</th>
              <th colspan="${Groups.list.length}" class="center g-first">자산군별 총액</th>
              <th colspan="${Groups.list.length}" class="center g-first">자산군별 비중 <span class="muted">(원화 환산 기준)</span></th>
            </tr>
            <tr>${[0, 1].map(() => Groups.list.map((g, i) => `<th class="num${i === 0 ? ' g-first' : ''}"><span class="dot" style="background:${g.color}"></span>${g.name}</th>`).join('')).join('')}</tr>
          </thead>
          <tbody>
            ${targetRows || `<tr><td colspan="${6 + Groups.list.length * 2}" class="muted">목표 비중이 없습니다. 계좌/자산관리에서 기준을 추가해 주세요.</td></tr>`}
            ${currentRow}
            ${diffRows}
          </tbody>
        </table></div>
        <p class="small muted">비중 칸의 매수·매도 행은 목표 % − 현재 % (%p, 퍼센트포인트) 입니다. 실제 주문 전에 수수료·세금·호가 단위를 따로 확인하세요.</p>
      </div>`;
  }

  // QQQ 현재가 vs 200일선 비교 카드
  function signalCard(sig) {
    if (!sig) return '<div class="sec notice">QQQ 200일선 정보를 불러오지 못했습니다. 잠시 후 [↻ 시세 갱신]을 눌러 주세요.</div>';
    const SRC = { GOOGLE: 'Google Finance', YAHOO: 'Yahoo Finance', NAVER: '네이버 금융' };
    const zone = {
      above: { cls: 'zone-above', text: '200일선 +1% 이상' },
      below: { cls: 'zone-below', text: '200일선 −1% 이하' },
      between: { cls: 'zone-between', text: '200일선 ±1% 사이 (기준 변경 없음 구간)' }
    }[sig.zone];
    const diff = sig.price - sig.sma;
    return `
      <div class="sec signal-grid">
        <div class="card stat"><div class="stat-t">QQQ 최신 현재가</div>
          <div class="stat-v">${Fmt.usd(sig.price)}</div>
          <div class="stat-sub">${SRC[sig.priceSource] || sig.priceSource} · ${Fmt.mdhm(sig.priceAsOf)} 기준</div></div>
        <div class="card stat"><div class="stat-t">QQQ ${sig.period}일선</div>
          <div class="stat-v">${Fmt.usd(sig.sma)}</div>
          <div class="stat-sub">최근 ${sig.period}거래일 종가 평균 · 마지막 종가 ${sig.smaDate} (미국) · ${SRC[sig.smaSource] || sig.smaSource}</div></div>
        <div class="card stat"><div class="stat-t">현재가 − ${sig.period}일선</div>
          <div class="stat-v"><span class="${Fmt.cls(sig.diffPct, 'PCT')}">${Fmt.pct(sig.diffPct)}</span></div>
          <div class="stat-sub"><span class="${Fmt.cls(diff, 'USD')}">${Fmt.signedMoney(diff, 'USD')}</span> · +1% 선 ${Fmt.usd(sig.sma * 1.01)} / −1% 선 ${Fmt.usd(sig.sma * 0.99)}</div></div>
        <div class="card stat ${zone.cls}"><div class="stat-t">현재 구간</div>
          <div class="stat-v zone-text">${zone.text}</div>
          <div class="stat-sub">${sig.zone === 'between' ? '±1% 사이에서는 직전 기준을 유지하는 것을 권장' : '아래 표에서 이 기준 행에 \'현재 해당\' 표시'}</div></div>
      </div>`;
  }

  App.init('invest', render);
})();
