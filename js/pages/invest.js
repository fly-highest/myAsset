// 투자 (invest.html) — 목표 비중 대비 현재 자산 현황과 매수·매도 필요 금액
//  ① 목표 행 (기준별): 총 평가금액 = 현재와 같음, 자산군별 금액 = 총 평가금액 × 목표 %
//  ② 현재 행: 자산 현황의 '현재 자산 현황'과 같은 값
//  ③ 매수·매도 행 (기준별): 목표 금액 − 현재 금액 (+ 매수 필요 / − 매도 필요), 비중은 목표 % − 현재 %
// 목표 비중은 계좌/자산관리 › 자산 구성 관리 › 목표 비중에서 수정합니다.
(function () {
  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const [ps, plans, sig, ...hs] = await Promise.all([DataService.getPriceStatus(), DataService.getTargetPlans(), DataService.getQqqSignal(),
      ...['QQQ', 'XAU', 'IEF'].map(p => DataService.getFxHistory(p).catch(() => []))]);
    const S = strategySignals(sig, { QQQ: hs[0], XAU: hs[1], IEF: hs[2] });
    // 지금 해당하는 기준: 기본 기준(200일선 +1% 이상 / −1% 이하)과 QQQ 200일선 구간을 연결 (±1% 사이면 직전 구간)
    const activeId = S.qqq && S.qqq.state ? { up: 'tgt-above', down: 'tgt-below' }[S.qqq.state] : null;
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
      ${sig ? '' : '<div class="sec notice">QQQ 200일선 정보를 불러오지 못했습니다. 잠시 후 [↻ 시세 갱신]을 눌러 주세요.</div>'}
      ${strategyTable(S, { plans, model, conv, cur })}
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

  // ---- 전략 신호: 상태 → 행동 표 ----
  // 이동평균 (n일, 그날 포함). 자료가 n일보다 적은 앞쪽은 null
  function smaOf(rows, n) {
    const out = new Array(rows.length).fill(null);
    let sum = 0;
    rows.forEach((r, i) => {
      sum += r.close;
      if (i >= n) sum -= rows[i - n].close;
      if (i >= n - 1) out[i] = sum / n;
    });
    return out;
  }
  // 1% 넘게 벗어날 때만 상태가 바뀌고 그 사이에서는 직전 상태 유지 → 지금 상태와 그 상태가 시작된 날
  function hysteresis(rows, diffs) {
    let state = null, since = null;
    diffs.forEach((d, i) => {
      if (d == null) return;
      const ns = d > 1 ? 'up' : d < -1 ? 'down' : state;
      if (ns !== state) { state = ns; since = rows[i].date; }
    });
    return { state, since };
  }
  // 빠른 선(fast, 1 = 그날 종가) ÷ 느린 선(slow) − 1 (%) 과 상태
  function crossSignal(rows, fast, slow) {
    if (rows.length < slow) return null;
    const f = fast === 1 ? rows.map(r => r.close) : smaOf(rows, fast), s = smaOf(rows, slow);
    const diffs = rows.map((r, i) => (f[i] != null && s[i] ? (f[i] / s[i] - 1) * 100 : null));
    const last = rows.length - 1, d = diffs[last];
    return { fast: f[last], slow: s[last], diff: d, raw: d > 1 ? 'up' : d < -1 ? 'down' : null, ...hysteresis(rows, diffs) };
  }
  function strategySignals(sig, hist) {
    // QQQ: 지금 값은 최신 현재가 vs 200일선(indicators), 직전 상태는 일별 종가(fx_daily)로 계산
    let qqq = null;
    if (sig) {
      const h = crossSignal(hist.QQQ, 1, sig.period || 200);
      const raw = sig.zone === 'above' ? 'up' : sig.zone === 'below' ? 'down' : null;
      const state = raw || (h && h.state);
      qqq = { fast: sig.price, slow: sig.sma, diff: sig.diffPct, asOf: sig.priceAsOf, raw, state, since: h && h.state === state ? h.since : raw ? '오늘' : null };
    }
    return { qqq, gold: crossSignal(hist.XAU, 20, 120), ief: crossSignal(hist.IEF, 1, 100) };
  }
  function strategyTable(S, { plans, model, conv, cur }) {
    const pct = v => (v == null ? '—' : `<span class="${Fmt.cls(v, 'PCT')}">${Fmt.pct(v)}</span>`);
    const since = s => (s && s.since ? `<div class="sub muted">${s.since === '오늘' ? '오늘부터' : esc(s.since) + '부터'}</div>` : '');
    const planName = id => { const p = plans.find(x => x.id === id); return p ? `'${esc(p.name)}'` : '해당 기준'; };
    // 한 전략 = 조건 3줄. 지금 조건에 해당하는 줄에 '현재', ±1% 사이일 때는 직전 상태 줄에 '적용 중'
    const block = (name, ind, s, conds) => conds.map((c, i) => {
      const now = !!s && (c.key === 'mid' ? !s.raw : s.raw === c.key);
      const apply = !!s && !s.raw && c.key === s.state;
      return `<tr class="${now || apply ? 'active-plan' : ''}">
        ${i === 0 ? `<td rowspan="${conds.length}" class="nowrap sticky-col"><b>${name}</b>${since(s)}</td><td rowspan="${conds.length}" class="small nowrap">${ind}</td>` : ''}
        <td>${c.when}</td><td>${c.act}</td>
        <td class="nowrap">${now ? '<span class="tag tag-active">현재</span>' : ''}${apply ? '<span class="tag tag-active">적용 중</span>' : ''}</td></tr>`;
    }).join('');
    const q = S.qqq, g = S.gold, f = S.ief, none = '<span class="muted">자료 없음</span>';
    const rows = [
      block('QQQ 200일선 — 자산 비중', q ? `QQQ ${Fmt.usd(q.fast)} <span class="muted">(${Fmt.mdhm(q.asOf)})</span><br>200일선 ${Fmt.usd(q.slow)}<br>차이 ${pct(q.diff)}` : none, q, [
        { key: 'up', when: 'QQQ가 200일선보다 <b>1% 넘게 위</b>', act: `${planName('tgt-above')} 목표 비중으로 맞춤` },
        { key: 'down', when: 'QQQ가 200일선보다 <b>1% 넘게 아래</b>', act: `${planName('tgt-below')} 목표 비중으로 맞춤` },
        { key: 'mid', when: '그 사이 (±1% 이내)', act: '직전 기준 유지' }]),
      block('금 살까? — 매수·매도', g ? `국제 금시세 20일선 ${Fmt.usd(g.fast)}<br>120일선 ${Fmt.usd(g.slow)}<br>차이 ${pct(g.diff)}` : none, g, [
        { key: 'up', when: '20일선이 120일선보다 <b>1% 넘게 위</b>', act: '<b class="pos">금을 삽니다</b>' },
        { key: 'down', when: '20일선이 120일선보다 <b>1% 넘게 아래</b>', act: '<b class="neg">금을 전부 팝니다</b>' },
        { key: 'mid', when: '그 사이 (±1% 이내)', act: '하던 대로 둡니다' }]),
      block('얼마나 살까? — 금 보유 비율', f ? `IEF(미 국채 7~10년) ${Fmt.usd(f.fast)}<br>100일선 ${Fmt.usd(f.slow)}<br>차이 ${pct(f.diff)}` : none, f, [
        { key: 'up', when: 'IEF가 100일선보다 <b>1% 넘게 위</b>', act: '🟢 금 목표 비중의 <b>100%</b> 보유' },
        { key: 'down', when: 'IEF가 100일선보다 <b>1% 넘게 아래</b>', act: '🟡 금 목표 비중의 <b>50%</b>만 보유' },
        { key: 'mid', when: '그 사이 (±1% 이내)', act: '이전 비중 유지' }])
    ].join('');

    // 지금 할 일: 자산 비중 기준 + 금 목표 = 기준의 금 % × (금 매수 상태면 IEF 비율 100%/50%, 매도 상태면 0)
    const planId = q && q.state ? { up: 'tgt-above', down: 'tgt-below' }[q.state] : null;
    const plan = plans.find(p => p.id === planId);
    const todo = [];
    if (plan) todo.push(`자산 비중: <b>${esc(plan.name)}</b> 목표 비중으로 맞추기 (아래 표의 '현재 해당' 행)`);
    const gold = model.groups.GOLD;
    if (plan && g && g.state && gold) {
      const ratio = g.state === 'down' ? 0 : f && f.state === 'down' ? 0.5 : f && f.state === 'up' ? 1 : null;
      if (ratio != null) {
        const gw = plan.weights.GOLD || 0, totalK = model.total.valK, tgt = gw * ratio;
        const curP = totalK ? (gold.agg.valK / totalK) * 100 : 0;
        const d = conv(totalK * tgt / 100 - gold.agg.valK);
        const how = g.state === 'down' ? '금 매도 상태' : `${Fmt.weight(gw)} × ${ratio * 100}%`;
        const act = Math.abs(d) < (cur === 'USD' ? 0.01 : 1) ? '그대로' : `<b class="${Fmt.cls(d, cur)}">${Fmt.signedMoney(d, cur)} ${d > 0 ? '매수' : '매도'}</b>`;
        todo.push(`금: 목표 <b>${Fmt.weight(tgt)}</b> (${how}) · 현재 ${Fmt.weight(curP)} → ${act}`);
      }
    }
    return `
      <div class="sec card pad">
        <div class="sec-hd"><h2>전략 신호</h2><span class="small muted">상태별로 할 일 · 1% 넘게 벗어날 때만 상태가 바뀌고, 그 사이에서는 직전 상태를 유지합니다 · 금은 국제 금시세(달러/온스) 일별 종가 기준</span></div>
        <div class="tbl-wrap"><table class="tbl invest strat">
          <thead><tr><th class="sticky-col">전략</th><th>지표 (지금)</th><th>상태</th><th>행동</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${todo.length ? `<div class="strat-todo"><b>지금 할 일</b><ul>${todo.map(t => `<li>${t}</li>`).join('')}</ul>
          <div class="small muted">아래 '목표 대비' 표의 금 금액은 기준의 금 목표 비중 그대로이고, 금 전략을 반영한 금액은 여기에 표시합니다.</div></div>` : ''}
      </div>`;
  }

  App.init('invest', render);
})();
