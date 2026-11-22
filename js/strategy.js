// 전략 신호 (투자 · Dashboard 공통) — QQQ 200일선 자산 비중 · 금(GLD) · 비트코인 매매 신호 표와 지금 할 일
(function () {
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
  // th% 넘게 벗어날 때만 상태가 바뀌고 그 사이에서는 직전 상태 유지 → 지금 상태와 그 상태가 시작된 날
  function hysteresis(rows, diffs, th) {
    let state = null, since = null;
    diffs.forEach((d, i) => {
      if (d == null) return;
      const ns = d > th ? 'up' : d < -th ? 'down' : state;
      if (ns !== state) { state = ns; since = rows[i].date; }
    });
    return { state, since };
  }
  // 빠른 선(fast, 1 = 그날 종가) ÷ 느린 선(slow) − 1 (%) 과 상태. th = 버퍼 % (기본 1%)
  function crossSignal(rows, fast, slow, th = 1) {
    if (rows.length < slow) return null;
    const f = fast === 1 ? rows.map(r => r.close) : smaOf(rows, fast), s = smaOf(rows, slow);
    const diffs = rows.map((r, i) => (f[i] != null && s[i] ? (f[i] / s[i] - 1) * 100 : null));
    const last = rows.length - 1, d = diffs[last];
    return { fast: f[last], slow: s[last], diff: d, th, asOf: rows[last].updated_at, raw: d > th ? 'up' : d < -th ? 'down' : null, ...hysteresis(rows, diffs, th) };
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
    return {
      qqq,
      gold: crossSignal(hist.GLD, 20, 120), ief: crossSignal(hist.IEF, 1, 100),           // 금: GLD 20/120일선 ±1%, IEF 100일선 ±1%
      btc: crossSignal(hist.BTC, 1, 120), iefBtc: crossSignal(hist.IEF, 1, 100, 0.5)       // 비트코인: BTC 종가/120일선 ±1%, IEF 100일선 ±0.5%
    };
  }
  function strategyTable(S, { plans, model, conv, cur, dash = false }) {
    const pct = v => (v == null ? '—' : `<span class="${Fmt.cls(v, 'PCT')}">${Fmt.pct(v)}</span>`);
    // 상태 시작일 · 마지막 확인 시각 (현재·적용 중 줄의 오른쪽 끝, 표시 왼쪽)
    const since = (d, at) => `<span class="since small muted">${d ? (d === '오늘' ? '오늘' : esc(d)) + '부터' : ''}${at ? ` · ${Fmt.mdhm(at)} 확인` : ''}</span>`;
    const planName = id => { const p = plans.find(x => x.id === id); return p ? `'${esc(p.name)}'` : '해당 기준'; };
    // 한 전략 = 조건 여러 줄. 지금 조건에 해당하는 줄(nowKey)에 '현재', 버퍼 사이일 때는 직전 상태 줄(applyKey)에 '적용 중'
    const block = (name, ind, [from, at], conds, nowKey, applyKey) => conds.map((c, i) => {
      const now = c.key === nowKey, apply = !!applyKey && c.key === applyKey;
      return `<tr class="${now || apply ? 'active-plan' : ''}">
        ${i === 0 ? `<td rowspan="${conds.length}" class="nowrap sticky-col"><b>${name}</b></td><td rowspan="${conds.length}" class="small nowrap">${ind}</td>` : ''}
        <td>${c.when}</td><td>${c.act}</td>
        <td class="nowrap right">${now && !applyKey || apply ? since(from, at) : ''}${now ? '<span class="tag tag-active">현재</span>' : ''}${apply ? '<span class="tag tag-active">적용 중</span>' : ''}</td></tr>`;
    }).join('');
    const q = S.qqq, none = '<span class="muted">자료 없음</span>';
    const thTxt = th => `${th}%`;
    // 추세(t) × IEF(f) → 전부 보유(full) / 절반 보유(half) / 전부 매도(sell)
    const comboKey = (ts, fs) => (ts === 'down' ? 'sell' : ts === 'up' && fs ? (fs === 'up' ? 'full' : 'half') : null);
    const combo = (t, f) => {
      if (!t || !f) return null;
      const raw = comboKey(t.raw, f.raw), eff = comboKey(t.state, f.state);
      return { t, f, raw, eff,
        from: !eff ? null : eff === 'sell' ? t.since : [t.since, f.since].sort().pop(),
        at: [t.asOf, f.asOf].filter(Boolean).sort()[0] }; // 두 지표 중 더 오래된 갱신 시각
    };
    // 금·비트코인 공통 4줄 블록. trendTxt = 추세 조건 이름, asset = 사고파는 것 (조사 포함), weightName = 목표 비중 이름
    const comboBlock = (name, c, indTrend, trendTxt, asset, weightName) => {
      if (!c) return block(name, none, [null, null], [{ key: 'x', when: '—', act: '—' }], null, null);
      const ft = thTxt(c.f.th), tt = thTxt(c.t.th);
      const ind = `${indTrend}<br>차이 ${pct(c.t.diff)}<br>IEF ${Fmt.usd(c.f.fast)} · 100일선 ${Fmt.usd(c.f.slow)}<br>차이 ${pct(c.f.diff)} <span class="muted">(±${ft})</span>`;
      return block(name, ind, [c.from, c.at], [
        { key: 'full', when: `${trendTxt}보다 <b>${tt} 넘게 위</b> · IEF가 100일선보다 <b>${ft} 넘게 위</b>`, act: `<b class="pos">${asset} 삽니다</b> · 🟢 ${weightName} 목표 비중의 <b>100%</b>` },
        { key: 'half', when: `${trendTxt}보다 <b>${tt} 넘게 위</b> · IEF가 100일선보다 <b>${ft} 넘게 아래</b>`, act: `<b class="pos">${asset} 삽니다</b> · 🟡 ${weightName} 목표 비중의 <b>50%</b>만` },
        { key: 'sell', when: `${trendTxt}보다 <b>${tt} 넘게 아래</b> (IEF 상관없음)`, act: `<b class="neg">${asset} 전부 팝니다</b> (현금으로)` },
        { key: 'mid', when: `그 사이 (추세 ±${tt} 또는 IEF ±${ft} 이내)`, act: '하던 대로 둡니다 (매수·매도와 비중 모두 직전 유지)' }], c.raw || 'mid', c.raw ? null : c.eff);
    };
    const G = combo(S.gold, S.ief), B = combo(S.btc, S.iefBtc);
    const rows = [
      block('QQQ 200일선 — 자산 비중', q ? `QQQ ${Fmt.usd(q.fast)} <span class="muted">(${Fmt.mdhm(q.asOf)})</span><br>200일선 ${Fmt.usd(q.slow)}<br>차이 ${pct(q.diff)}` : none, [q && q.since, q && q.asOf], [
        { key: 'up', when: 'QQQ가 200일선보다 <b>1% 넘게 위</b>', act: `${planName('tgt-above')} 목표 비중으로 맞춤` },
        { key: 'down', when: 'QQQ가 200일선보다 <b>1% 넘게 아래</b>', act: `${planName('tgt-below')} 목표 비중으로 맞춤` },
        { key: 'mid', when: '그 사이 (±1% 이내)', act: '직전 기준 유지' }], q ? q.raw || 'mid' : null, q && !q.raw ? q.state : null),
      comboBlock('금(GLD) 매매 — 살까? · 얼마나?', G, G && `GLD 20일선 ${Fmt.usd(G.t.fast)} · 120일선 ${Fmt.usd(G.t.slow)}`, 'GLD 20일선이 120일선', 'GLD를', '금'),
      comboBlock('비트코인 매매 — 살까? · 얼마나?', B, B && `BTC ${Fmt.usd(B.t.fast)} · 120일선 ${Fmt.usd(B.t.slow)}`, 'BTC 종가가 120일선', '비트코인을', 'Crypto')
    ].join('');

    // 지금 할 일: 자산 비중 기준 + 금·비트코인 목표 = 기준의 자산군 % × (매수 상태면 IEF 비율 100%/50%, 매도 상태면 0)
    const planId = q && q.state ? { up: 'tgt-above', down: 'tgt-below' }[q.state] : null;
    const plan = plans.find(p => p.id === planId);
    const todo = [];
    if (plan) todo.push(`자산 비중: <b>${esc(plan.name)}</b> 목표 비중으로 맞추기${dash ? '' : " (아래 표의 '현재 해당' 행)"}`);
    const totalK = model.total.valK;
    [[G, 'GOLD', '금'], [B, 'BLOCKCHAIN', '비트코인(Crypto)']].forEach(([c, code, label]) => {
      const grp = model.groups[code];
      if (!plan || !c || !c.t.state || !grp) return;
      const ratio = c.t.state === 'down' ? 0 : c.f.state === 'down' ? 0.5 : c.f.state === 'up' ? 1 : null;
      if (ratio == null) return;
      const w = plan.weights[code] || 0, tgt = w * ratio;
      const curP = totalK ? (grp.agg.valK / totalK) * 100 : 0;
      const d = conv(totalK * tgt / 100 - grp.agg.valK);
      const how = c.t.state === 'down' ? '매도 상태' : `${Fmt.weight(w)} × ${ratio * 100}%`;
      const act = Math.abs(d) < (cur === 'USD' ? 0.01 : 1) ? '그대로' : `<b class="${Fmt.cls(d, cur)}">${Fmt.signedMoney(d, cur)} ${d > 0 ? '매수' : '매도'}</b>`;
      todo.push(`${label}: 목표 <b>${Fmt.weight(tgt)}</b> (${how}) · 현재 ${Fmt.weight(curP)} → ${act}`);
    });
    return `
      <div class="sec card pad">
        <div class="sec-hd"><h2>전략 신호</h2>${dash ? '<a href="invest.html">투자에서 보기 →</a>' : ''}<span class="small muted">상태별로 할 일 · 버퍼(±1%, 비트코인의 IEF는 ±0.5%)를 넘어설 때만 상태가 바뀌고, 그 사이에서는 직전 상태를 유지합니다 · 금은 GLD, 비트코인은 BTC/USD 일별 종가 기준</span></div>
        <div class="tbl-wrap"><table class="tbl invest strat">
          <thead><tr><th class="sticky-col">전략</th><th>지표 (지금)</th><th>상태</th><th>행동</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${todo.length ? `<div class="strat-todo"><b>지금 할 일</b><ul>${todo.map(t => `<li>${t}</li>`).join('')}</ul>
          <div class="small muted">${dash ? '투자 화면' : "아래 '목표 대비' 표"}의 금·Crypto 금액은 기준의 목표 비중 그대로이고, 전략을 반영한 금액은 여기에 표시합니다.</div></div>` : ''}
      </div>`;
  }
  // 표에 필요한 자료(목표 비중 기준, QQQ 200일선, 일별 종가)를 불러와 신호 계산
  async function load() {
    const [plans, sig, ...hs] = await Promise.all([DataService.getTargetPlans(), DataService.getQqqSignal(),
      ...['QQQ', 'GLD', 'IEF', 'BTC'].map(p => DataService.getFxHistory(p).catch(() => []))]);
    return { plans, sig, S: strategySignals(sig, { QQQ: hs[0], GLD: hs[1], IEF: hs[2], BTC: hs[3] }) };
  }
  // 목표 비교 통화: 혼합 모드는 원화, 금환산은 금 g
  function money(model) {
    const mode = App.mode === 'USD' || (App.mode === 'GOLD' && model.gold) ? App.mode : 'KRW';
    const cur = mode === 'GOLD' ? 'XAU' : mode, fx = model.fx;
    const conv = k => (cur === 'USD' ? (fx ? k / fx : 0) : cur === 'XAU' ? Calc.toGram(fx ? k / fx : 0, model.gold) : k);
    return { mode, cur, conv };
  }
  window.Strategy = { load, money, table: strategyTable, signals: strategySignals };
})();
