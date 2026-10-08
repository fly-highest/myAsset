// 자산군 현황 (groups.html) — 자산군 기준 현황 + 자산군 구성 관리 (8·9·11항)
(function () {
  const openGroups = new Set();
  const openInsts = new Set();
  let pendingHash = location.hash.slice(1);

  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const mode = App.mode;
    const total = model.total.valK;
    const accName = Object.fromEntries(model.accounts.map(a => [a.key, a.name]));
    if (pendingHash && Groups.codes.includes(pendingHash)) openGroups.add(pendingHash);

    let body = '';
    Groups.list.forEach(g => {
      const G = model.groups[g.code];
      const v = Calc.view(G.agg, mode, model.fx);
      const insts = Object.values(G.insts).sort((a, b) => b.agg.valK - a.agg.valK);
      const isOpen = openGroups.has(g.code);
      body += `<tr class="g-row" id="${g.code}">
        <td><button type="button" class="tg" data-tg-group="${g.code}">${isOpen ? '▾' : '▸'}</button><span class="dot" style="background:${g.color}"></span>${g.name}
          <span class="muted small">${insts.length}종목</span></td>
        <td></td><td></td><td></td>
        <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v)}</td><td class="num">${UI.ret(v)}</td>
        <td></td><td class="num">${UI.weight(UI.w(G.agg.valK, total))}</td>
        <td class="actions"><button type="button" class="btn btn-sm" data-comp="${g.code}">구성</button></td>
      </tr>`;
      if (!isOpen) return;
      if (!insts.length) body += `<tr class="i-row"><td colspan="11" class="muted">보유 중인 종목이 없습니다</td></tr>`;
      insts.forEach(I => {
        const inst = I.inst, isUSD = inst.currency === 'USD', isCash = inst.asset_type === 'CASH';
        const key = g.code + '|' + inst.id;
        const io = openInsts.has(key);
        const iv = Calc.view(I.agg, mode, model.fx);
        // 종목 단위 평균매입가 = 원본통화 투자금액 합 ÷ 수량 합, 매입 평균환율 = 원화 투자금액 합 ÷ 원본통화 투자금액 합
        const avg = I.agg.q ? I.agg.invO / I.agg.q : 0;
        const avgFx = I.agg.invO ? I.agg.invK / I.agg.invO : 0;
        const cp = I.rows[0].r.cp;
        body += `<tr class="i-row ${I.unassigned ? 'unassigned' : ''}">
          <td><button type="button" class="tg" data-tg-inst="${esc(key)}">${io ? '▾' : '▸'}</button><b>${esc(inst.name)}</b>
            <span class="muted small">${esc(inst.symbol)}</span>${I.unassigned ? ' ' + UI.groupBadge('OTHER_STOCK', true, { link: false }) : ''}
            <span class="tag">${I.rows.length}계좌</span></td>
          <td class="num">${Fmt.qty(I.agg.q, inst)}</td>
          <td class="num">${isCash ? '<span class="muted">—</span>' : Fmt.price(avg, inst.currency)}${isUSD ? `<div class="sub">환율 ${Fmt.fx(avgFx)}</div>` : ''}</td>
          <td class="num">${isCash || I.noPrice ? '<span class="muted">—</span>' : Fmt.price(cp, inst.currency)}</td>
          <td class="num">${UI.amt(iv, 'val')}</td><td class="num">${UI.amt(iv, 'inv')}</td><td class="num">${UI.prof(iv)}</td><td class="num">${UI.ret(iv)}</td>
          <td class="num" title="자산군 내 비중">${UI.weight(UI.w(I.agg.valK, G.agg.valK))}</td>
          <td class="num" title="전체 대비 비중">${UI.weight(UI.w(I.agg.valK, total))}</td><td></td>
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
            <td class="num">${UI.weight(UI.w(x.r.valK, G.agg.valK))}</td><td class="num">${UI.weight(UI.w(x.r.valK, total))}</td><td></td>
          </tr>`;
        });
      });
    });
    const tv = Calc.view(model.total, mode, model.fx);

    document.getElementById('main').innerHTML = `
      <div class="page-hd">
        <div><h1>자산군 현황</h1><p class="desc">7개 자산군 기준 현황입니다. 행을 펼치면 종목별 합산 → 계좌별 내역을 볼 수 있습니다. 자산군 분류 변경은 [구성]에서만 합니다.</p></div>
        <div class="toolbar"><button type="button" class="btn btn-sm" id="exp-all">모두 펼치기</button><button type="button" class="btn btn-sm" id="col-all">모두 접기</button></div>
      </div>
      ${App.statusBar(status, { showSnapshot: false })}
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>자산군 / 종목 / 계좌</th><th class="num">수량</th><th class="num">평균매입가</th><th class="num">현재가</th>
            <th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th>
            <th class="num">자산군 내 비중</th><th class="num">전체 대비 비중</th><th></th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td>합계</td><td></td><td></td><td></td><td class="num">${UI.amt(tv, 'val')}</td><td class="num">${UI.amt(tv, 'inv')}</td><td class="num">${UI.prof(tv)}</td><td class="num">${UI.ret(tv)}</td><td></td><td class="num">${UI.weight(total ? 100 : 0)}</td><td></td></tr></tfoot>
        </table></div>
        <p class="small muted">회색 <span class="gbadge unassigned">기타종목<small>미지정</small></span> 표시는 자산군이 지정되지 않아 기타종목으로 집계된 종목입니다. 수량·평균단가는 <a href="accounts.html">계좌 관리</a>에서 수정합니다.</p>
      </div>`;

    const main = document.getElementById('main');
    main.querySelectorAll('[data-tg-group]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.tgGroup; openGroups.has(c) ? openGroups.delete(c) : openGroups.add(c); App.rerender();
    }));
    main.querySelectorAll('[data-tg-inst]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.tgInst; openInsts.has(c) ? openInsts.delete(c) : openInsts.add(c); App.rerender();
    }));
    main.querySelectorAll('[data-comp]').forEach(b => b.addEventListener('click', () => openComposition(b.dataset.comp)));
    main.querySelector('#exp-all').addEventListener('click', () => { Groups.codes.forEach(c => openGroups.add(c)); App.rerender(); });
    main.querySelector('#col-all').addEventListener('click', () => { openGroups.clear(); openInsts.clear(); App.rerender(); });

    if (pendingHash) {
      const row = document.getElementById(pendingHash);
      pendingHash = '';
      if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); }
    }
  }

  window.addEventListener('hashchange', () => { pendingHash = location.hash.slice(1); App.rerender(); });

  // ---- 자산군 구성 (8·9항): 종목명과 [제거]만 표시, 종목 단위로 한 번만 ----
  function openComposition(code) {
    const m = App.modal({ title: `${Groups.name(code)} 구성`, size: 'mid', body: '', buttons: [{ label: '닫기' }] });
    async function draw() {
      const insts = await DataService.getInstruments();
      const members = insts.filter(i => i.asset_group === code);
      const unassigned = code === 'OTHER_STOCK' ? insts.filter(i => !i.asset_group) : [];
      m.body.innerHTML = `
        <p class="small muted" style="margin-top:0">자산군 분류는 종목 단위입니다. 여러 계좌에 있는 종목도 한 줄로 표시되며, 이동하면 모든 계좌의 보유분이 함께 이동합니다.</p>
        <ul class="comp-list">
          ${members.map(i => `<li><span>${esc(i.name)}</span><button type="button" class="btn btn-sm btn-ghost-danger" data-remove="${esc(i.id)}">제거</button></li>`).join('')}
          ${unassigned.map(i => `<li class="unassigned"><span>${esc(i.name)} ${UI.groupBadge('OTHER_STOCK', true, { link: false })}</span><span class="small">자산군 미지정 — 기타종목으로 집계 중</span></li>`).join('')}
          ${!members.length && !unassigned.length ? '<li class="muted">구성 종목이 없습니다</li>' : ''}
        </ul>
        <div style="margin-top:12px"><button type="button" class="btn btn-primary" id="comp-add">+ 종목 추가</button></div>`;
      m.body.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
        const inst = members.find(i => i.id === b.dataset.remove);
        const ok = await App.confirm(`<b>${esc(inst.name)}</b>을(를) ${Groups.name(code)}에서 제거할까요?<br><small>종목 자체는 삭제되지 않으며 자산군 분류만 해제됩니다. (해제된 종목은 기타종목으로 집계되고 회색으로 표시됩니다)</small>`, { okLabel: '제거', danger: true });
        if (!ok) return;
        await DataService.updateInstrumentGroup(inst.id, null);
        App.toast(`${inst.name}의 자산군 분류를 해제했습니다.`);
        draw();
      }));
      m.body.querySelector('#comp-add').addEventListener('click', async () => {
        const inst = await UI.pickInstrument({ title: `${Groups.name(code)}에 종목 추가`, confirmLabel: '확인', note: '종목 마스터에서 검색해 한 종목을 선택하세요.' });
        if (!inst) return;
        if (inst.asset_group === code) { await App.alert(`<b>${esc(inst.name)}</b>은(는) 이미 ${Groups.name(code)}에 있습니다. 중복 등록하지 않습니다.`); return; }
        if (inst.asset_group) {
          const ok = await App.confirm(`이 자산을 현재 자산군으로 이동하시겠습니까?<br><small><b>${esc(inst.name)}</b>: ${Groups.name(inst.asset_group)} → ${Groups.name(code)}<br>이 종목을 보유한 모든 계좌의 보유분이 함께 이동합니다.</small>`, { okLabel: '이동' });
          if (!ok) return;
        }
        await DataService.updateInstrumentGroup(inst.id, code);
        App.toast(`${inst.name} → ${Groups.name(code)}`);
        draw();
      });
    }
    draw();
  }

  App.init('groups', render);
})();
