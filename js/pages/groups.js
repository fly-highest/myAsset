// 자산 현황 (groups.html) — 자산군 · 추종 통화 · 자산 성향 기준 현황, 조회 전용 (분류 변경은 계좌/자산관리 화면)
(function () {
  const openGroups = new Set(); // 펼친 묶음 (기준|코드)
  const openInsts = new Set();
  let pendingHash = location.hash.slice(1);
  // 묶는 기준: 자산군별 / 추종 통화별 / 자산 성향별 — 이 브라우저에 기억
  const DIMS = [['group', '자산군별'], ['track', '추종 통화별'], ['style', '자산 성향별']];
  const DIM_KEY = 'myAsset.groups.dim';
  let dim = 'group';
  try { const s = localStorage.getItem(DIM_KEY); if (DIMS.some(d => d[0] === s)) dim = s; } catch (e) { /* 무시 */ }

  // 기준별 묶음: { list, groups, label }
  function dimension(model) {
    if (dim === 'track') return { ...Calc.dimension(model, { list: TrackCur.list, split: i => [[TrackCur.of(i), 1]] }), label: '추종 통화' };
    if (dim === 'style') {
      const d = Calc.dimension(model, { list: [...Styles.list, Styles.UNSET], split: i => Styles.split(i) });
      if (!d.groups.UNSET.agg.n) d.list = Styles.list; // 미지정이 없으면 칸을 숨김
      return { ...d, label: '자산 성향' };
    }
    return { list: Groups.list, groups: model.groups, label: '자산군' };
  }

  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const ps = await DataService.getPriceStatus();
    const mode = App.mode;
    const total = model.total.valK;
    const accName = Object.fromEntries(model.accounts.map(a => [a.key, a.name]));
    const D = dimension(model);
    if (pendingHash && dim === 'group' && Groups.codes.includes(pendingHash)) openGroups.add('group|' + pendingHash);

    let body = '';
    D.list.forEach(g => {
      const G = D.groups[g.code];
      const gk = dim + '|' + g.code;
      const v = Calc.view(G.agg, mode, model.fx);
      const insts = Object.values(G.insts).sort((a, b) => b.agg.valK - a.agg.valK);
      const isOpen = openGroups.has(gk);
      body += `<tr class="g-row" id="${dim === 'group' ? g.code : esc(gk)}">
        <td><button type="button" class="tg" data-tg-group="${esc(gk)}">${isOpen ? '▾' : '▸'}</button><span class="dot" style="background:${g.color}"></span>${esc(g.name)}
          <span class="muted small">${insts.length}종목</span></td>
        <td></td><td></td><td></td>
        <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v)}</td><td class="num">${UI.ret(v)}</td>
        <td></td><td class="num">${UI.weight(UI.w(G.agg.valK, total))}</td>
      </tr>`;
      if (!isOpen) return;
      if (!insts.length) body += `<tr class="i-row"><td colspan="10" class="muted">보유 중인 종목이 없습니다</td></tr>`;
      insts.forEach(I => {
        const inst = I.inst, isUSD = inst.currency === 'USD', isCash = inst.asset_type === 'CASH';
        const key = gk + '|' + inst.id;
        const io = openInsts.has(key);
        const iv = Calc.view(I.agg, mode, model.fx);
        // 종목 단위 평균매입가 = 원본통화 투자금액 합 ÷ 수량 합, 매입 평균환율 = 원화 투자금액 합 ÷ 원본통화 투자금액 합
        const avg = I.agg.q ? I.agg.invO / I.agg.q : 0;
        const avgFx = I.agg.invO ? I.agg.invK / I.agg.invO : 0;
        const cp = I.rows[0].r.cp;
        // 기준별 표시: 자산군 미지정 / 혼합 성향의 나눈 비율 / 자산유형으로 정한 기본 성향
        let mark = '';
        if (dim === 'group' && I.unassigned) mark = ' ' + UI.groupBadge('OTHER_STOCK', true, { link: false });
        if (dim === 'style' && I.share < 1) mark = ` <span class="tag" title="${esc(Styles.name(Styles.effective(inst)))} → ${esc(g.name)} 몫만 합산">${esc(Styles.name(Styles.effective(inst)))} 중 ${Math.round(I.share * 100)}%</span>`;
        if (dim === 'style' && Styles.isDefault(inst) && g.code !== 'UNSET') mark += ' <span class="muted small" title="자산 성향을 정하지 않아 자산유형으로 정한 값">(기본값)</span>';
        if (dim === 'track' && inst.track_currency && inst.track_currency !== inst.currency) mark = ` <span class="muted small">거래 ${esc(inst.currency)}</span>`;
        body += `<tr class="i-row ${I.unassigned && dim === 'group' ? 'unassigned' : ''}">
          <td><button type="button" class="tg" data-tg-inst="${esc(key)}">${io ? '▾' : '▸'}</button><b class="nm-clip" title="${esc(inst.name)}${inst.eng_name ? ' &#10;' + esc(inst.eng_name) : ''}">${esc(inst.name)}</b>
            <span class="muted small">${esc(inst.symbol)}</span>${mark}
            <span class="tag">${I.rows.length}계좌</span></td>
          <td class="num">${Fmt.qty(I.agg.q, inst)}</td>
          <td class="num">${isCash ? '<span class="muted">—</span>' : Fmt.price(avg, inst.currency)}${isUSD ? `<div class="sub">환율 ${Fmt.fx(avgFx)}</div>` : ''}</td>
          <td class="num">${UI.priceCell(cp, inst, I.rows[0].priceMeta, I.noPrice)}</td>
          <td class="num">${UI.amt(iv, 'val')}</td><td class="num">${UI.amt(iv, 'inv')}</td><td class="num">${UI.prof(iv)}</td><td class="num">${UI.ret(iv)}</td>
          <td class="num" title="${D.label} 내 비중">${UI.weight(UI.w(I.agg.valK, G.agg.valK))}</td>
          <td class="num" title="전체 대비 비중">${UI.weight(UI.w(I.agg.valK, total))}</td>
        </tr>`;
        if (!io) return;
        I.rows.forEach(x => {
          const av = Calc.view(Calc.add(Calc.emptyAgg(), x.r), mode, model.fx);
          body += `<tr class="a-row">
            <td>${esc(accName[x.accKey] || '')}</td>
            <td class="num">${Fmt.qty(x.r.q, inst)}</td>
            <td class="num">${isCash ? '<span class="muted">—</span>' : Fmt.price(x.r.ap, inst.currency)}${isUSD ? `<div class="sub">환율 ${Fmt.fx(x.r.fxBuy)}</div>` : ''}</td>
            <td class="num"></td>
            <td class="num">${UI.amt(av, 'val')}</td><td class="num">${UI.amt(av, 'inv')}</td><td class="num">${UI.prof(av)}</td><td class="num">${UI.ret(av)}</td>
            <td class="num">${UI.weight(UI.w(x.r.valK, G.agg.valK))}</td><td class="num">${UI.weight(UI.w(x.r.valK, total))}</td>
          </tr>`;
        });
      });
    });
    const tv = Calc.view(model.total, mode, model.fx);
    const note = {
      group: `회색 <span class="gbadge unassigned">기타종목<small>미지정</small></span> 표시는 자산군이 지정되지 않아 기타종목으로 집계된 종목입니다.`,
      track: '추종 통화 = 가격이 따라가는 통화입니다 (예: 원화로 사는 미국 ETF는 거래 통화 KRW · 추종 통화 USD). 정하지 않은 종목은 거래 통화로 집계합니다.',
      style: '성50배50·성55배45 같은 혼합 성향은 성장·배당에 비율대로 나눠 합산합니다 (예: 성55배45 = 성장 55% + 배당 45%). 성향을 정하지 않은 종목은 현금 → 현금, 가상자산 → Crypto, 금 → 원자재로 보고, 그 밖은 미지정입니다.'
    }[dim];

    document.getElementById('main').innerHTML = `
      <div class="page-hd">
        <div><h1>자산 현황</h1><p class="desc">자산군 · 추종 통화 · 자산 성향 기준으로 묶어 본 현황입니다. 행을 펼치면 종목별 합산 → 계좌별 내역을 볼 수 있습니다. 분류 변경은 <a href="manage.html#composition">계좌/자산관리</a>의 [자산군 변경]에서 합니다.</p></div>
        <div class="toolbar">
          <div class="seg" role="group" aria-label="묶는 기준">${DIMS.map(([k, l]) => `<button type="button" data-dim="${k}" class="${k === dim ? 'on' : ''}">${l}</button>`).join('')}</div>
          <button type="button" class="btn btn-sm" id="exp-all">모두 펼치기</button><button type="button" class="btn btn-sm" id="col-all">모두 접기</button></div>
      </div>
      ${App.statusBar(status, { showSnapshot: false })}
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        <div class="sec-hd"><h2>현재 자산 현황 <span class="muted small">· ${D.label}별</span></h2><span class="small muted">이력의 날짜별 자산 현황과 같은 양식 · 현재 분류 · 비중은 ${mode === 'MIXED' ? '통화별 자산 안에서의 비중' : '원화 환산 기준'}</span></div>
        ${UI.statusTable([{ label: '현재', sub: ps.latestAsOf ? `시세 ${Fmt.mdhm(ps.latestAsOf)}` : '예시 시세', model: { ...model, groups: D.groups } }], mode, { firstHeader: '기준', wrapClass: 'now-wrap', list: D.list, dimLabel: D.label })}
      </div>
      <div class="sec">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>${D.label} / 종목 / 계좌</th><th class="num">수량</th><th class="num">평균매입가</th><th class="num">현재가</th>
            <th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th>
            <th class="num">${D.label} 내 비중</th><th class="num">전체 대비 비중</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td>합계</td><td></td><td></td><td></td><td class="num">${UI.amt(tv, 'val')}</td><td class="num">${UI.amt(tv, 'inv')}</td><td class="num">${UI.prof(tv)}</td><td class="num">${UI.ret(tv)}</td><td></td><td class="num">${UI.weight(total ? 100 : 0)}</td></tr></tfoot>
        </table></div>
        <p class="small muted">${note} 수량·평균단가는 <a href="manage.html#accounts">계좌/자산관리 › 계좌 관리</a>에서 수정합니다.</p>
      </div>`;

    const main = document.getElementById('main');
    main.querySelectorAll('[data-dim]').forEach(b => b.addEventListener('click', () => {
      dim = b.dataset.dim;
      try { localStorage.setItem(DIM_KEY, dim); } catch (e) { /* 무시 */ }
      App.rerender();
    }));
    main.querySelectorAll('[data-tg-group]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.tgGroup; openGroups.has(c) ? openGroups.delete(c) : openGroups.add(c); App.rerender();
    }));
    main.querySelectorAll('[data-tg-inst]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.tgInst; openInsts.has(c) ? openInsts.delete(c) : openInsts.add(c); App.rerender();
    }));
    main.querySelector('#exp-all').addEventListener('click', () => { D.list.forEach(g => openGroups.add(dim + '|' + g.code)); App.rerender(); });
    main.querySelector('#col-all').addEventListener('click', () => { openGroups.clear(); openInsts.clear(); App.rerender(); });

    if (pendingHash) {
      const row = document.getElementById(pendingHash);
      pendingHash = '';
      if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); }
    }
  }

  // 다른 화면에서 자산군 배지를 눌러 오면(#자산군코드) 자산군별 보기로 열어 줌
  window.addEventListener('hashchange', () => { pendingHash = location.hash.slice(1); if (Groups.codes.includes(pendingHash)) dim = 'group'; App.rerender(); });
  if (Groups.codes.includes(pendingHash)) dim = 'group';

  App.init('groups', render);
})();
