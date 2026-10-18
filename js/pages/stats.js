// 통계분석 (stats.html) — 계좌 현황을 바탕으로, 증권사 · 계좌 종류 · 자산군으로 대상을 골라
// 맨 위 줄에 합계, 그 아래에 고른 대상의 종목 행(증권사 · 계좌 종류 · 계좌 · 종목 …)을 한 표로 펼쳐 보여 줍니다. 조회 전용
(function () {
  const FILTER_KEY = 'myAsset.stats.filters';
  const SORT_KEY = 'myAsset.stats.sort';
  const SORTS = [['default', '등록순'], ['value', '평가금액 큰 순'], ['ret', '수익률 높은 순'], ['retAsc', '수익률 낮은 순'], ['group', '자산군순']];
  let sortBy = 'default';
  try { const s = localStorage.getItem(SORT_KEY); if (SORTS.some(x => x[0] === s)) sortBy = s; } catch (e) { /* 무시 */ }
  const st = { filterKey: FILTER_KEY, ...UI.loadFilters(FILTER_KEY) }; // 필터 선택은 이 브라우저에 기억
  // 행 체크박스: 기본은 모두 체크, 체크를 끈 행만 기억 (체크된 행만 맨 위 합계에 더함). 다른 화면에 다녀오거나 새로고침해도 유지 (아래 CHECK_KEY)
  // 체크 상태(끈 행 · 불러온 저장본 이름)는 다른 화면에 다녀오거나 새로고침해도 유지 — 이 브라우저에 기억
  const CHECK_KEY = 'myAsset.stats.check';
  let unchecked = new Set(), loaded = null;
  try { const s = JSON.parse(localStorage.getItem(CHECK_KEY)); if (s && Array.isArray(s.unchecked)) { unchecked = new Set(s.unchecked.map(String)); loaded = s.loaded || null; } } catch (e) { /* 무시 */ }
  const saveCheck = () => { try { localStorage.setItem(CHECK_KEY, JSON.stringify({ unchecked: [...unchecked], loaded })); } catch (e) { /* 무시 */ } };
  // Save · Load: 저장한 체크 상태를 불러오면 다음 그리기에서 그 목록대로 체크 (금액은 불러온 시점 값으로 계산)
  let pendingChecked = null; // 불러온 저장본의 체크 목록 (다음 그리기에서 반영). loaded = 지금 화면에 불러온 저장본 { name, desc, saved_at }
  const rowKey = x => (x.holding ? x.holding.id : x.accKey + '|' + x.inst.id);

  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const mode = App.mode;
    const main = document.getElementById('main');
    const filterHtml = UI.filterBar(model, st); // (지금은 없는 선택 값 정리도 여기서)

    // 고른 대상의 종목 행 = 계좌(증권사 · 계좌 종류 필터) × 그 계좌의 종목(자산군 필터)
    const rows = [];
    model.accounts
      .filter(a => (!st.brokers.length || st.brokers.includes(UI.accBroker(a))) && (!st.types.length || st.types.includes(UI.accType(a))))
      .forEach(a => a.rows.filter(x => UI.groupMatch(x, st.groups)).forEach(x => rows.push({ a, x })));
    const gIdx = c => Groups.codes.indexOf(c);
    if (sortBy === 'value') rows.sort((p, q) => q.x.r.valK - p.x.r.valK);
    else if (sortBy === 'ret' || sortBy === 'retAsc') rows.sort((p, q) => (sortBy === 'ret' ? 1 : -1) * (q.x.r.retK - p.x.r.retK));
    else if (sortBy === 'group') rows.sort((p, q) => gIdx(p.x.group) - gIdx(q.x.group) || (p.x.unassigned - q.x.unassigned) || q.x.r.valK - p.x.r.valK);

    if (pendingChecked) { // 불러온 저장본: 저장한 목록에 있는 행만 체크
      unchecked = new Set(rows.map(({ x }) => rowKey(x)).filter(k => !pendingChecked.has(k)));
      pendingChecked = null;
    }
    const on = rows.filter(({ x }) => !unchecked.has(rowKey(x)));
    const sum = on.reduce((g, { x }) => Calc.add(g, x.r), Calc.emptyAgg());
    const sv = Calc.view(sum, mode, model.fx);
    const filtered = st.brokers.length || st.types.length || st.groups.length;
    const body = rows.map(({ a, x }) => {
      const i = x.inst, isCash = i.asset_type === 'CASH', isUSD = i.currency === 'USD';
      const v = Calc.view(Calc.add(Calc.emptyAgg(), x.r), mode, model.fx);
      const k = rowKey(x), chk = !unchecked.has(k);
      return `<tr class="${chk ? '' : 'row-off'}">
        <td class="chk-col"><input type="checkbox" data-row="${esc(k)}" ${chk ? 'checked' : ''} aria-label="합계에 넣기"></td>
        <td class="nowrap">${esc(UI.accBroker(a))}</td>
        <td class="nowrap">${esc(UI.accType(a))}</td>
        <td class="nowrap">${esc(a.name)}</td>
        <td class="nm"><span class="nm-clip" title="${esc(i.name)}${i.eng_name ? ' &#10;' + esc(i.eng_name) : ''}">${esc(i.name)}</span></td>
        <td class="sym">${esc(i.symbol)}<small>${esc(i.exchange)}</small></td>
        <td class="g-cell">${UI.groupBadge(x.group, x.unassigned)}</td>
        <td class="num">${Fmt.qty(x.r.q, i)}</td>
        <td class="num">${isCash ? '<span class="muted">—</span>' : Fmt.price(x.r.ap, i.currency)}</td>
        <td class="num">${isUSD ? Fmt.fx(x.r.fxBuy) : '<span class="muted">—</span>'}</td>
        <td class="num">${UI.priceCell(x.r.cp, i, x.priceMeta, x.noPrice)}</td>
        <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v)}</td><td class="num">${UI.ret(v, { split: true })}</td>
        <td class="num" title="체크한 종목 합계 대비 비중">${chk ? UI.weight(UI.w(x.r.valK, sum.valK), false) : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="page-hd">
        <div><h1>통계분석</h1><p class="desc">증권사 · 계좌 종류 · 자산군 버튼으로 대상을 골라, 맨 위 줄에 합계를, 그 아래에 해당 종목을 한 표로 봅니다 (조회 전용). 수정은 <a href="manage.html#accounts">계좌/자산관리 › 계좌 관리</a>에서 합니다.</p></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        <div class="sec-hd">
          <div class="toolbar">
            ${filterHtml}
            <label class="small muted" for="s-sort">정렬</label>
            <select id="s-sort" class="inline">${SORTS.map(([k, l]) => `<option value="${k}" ${k === sortBy ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <button type="button" class="btn btn-sm" id="p-save" title="지금 고른 대상(증권사 · 계좌 종류 · 자산군)과 체크한 종목을 이름을 붙여 저장">Save</button>
            <button type="button" class="btn btn-sm" id="p-load" title="저장해 둔 체크 상태를 불러옵니다 (금액은 지금 시세 기준)">Load</button>
            ${loaded ? `<span class="tag" title="저장 일시 ${esc(fmtAt(loaded.saved_at))}">불러옴: ${esc(loaded.name)}</span>` : ''}
          </div>
        </div>
        <div class="tbl-wrap stats-wrap"><table class="tbl tree stats-tbl">
          <thead><tr>
            <th class="chk-col"></th><th>증권사</th><th>계좌 종류</th><th>계좌</th><th>종목명</th><th>심볼</th><th>자산군</th>
            <th class="num">수량</th><th class="num">평균매입가</th><th class="num">매입환율</th><th class="num">현재가</th>
            <th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th>
            <th class="num" title="종목 행: 체크한 종목 합계 대비 / 합계 행: 전체 대비">비중</th>
          </tr></thead>
          <tbody>
            <tr class="broker-row sum-row"><td class="chk-col"><input type="checkbox" class="chk-all" ${on.length === rows.length ? 'checked' : ''} title="전체 선택 / 전체 해제" aria-label="전체 선택 또는 해제"></td><td colspan="10"><b>${on.length < rows.length ? '체크한 종목 합계' : filtered ? '선택 대상 합계' : '전체 합계'}</b> <span class="muted">· ${on.length}/${rows.length}개 종목 행 · ${new Set(on.map(r => r.a.key)).size}개 계좌</span></td>
              <td class="num">${UI.amt(sv, 'val')}</td><td class="num">${UI.amt(sv, 'inv')}</td><td class="num">${UI.prof(sv)}</td><td class="num">${UI.ret(sv, { split: true })}</td>
              <td class="num" title="전체 대비 비중">${UI.weight(UI.w(sum.valK, model.total.valK), false)}</td></tr>
            ${body || '<tr><td colspan="16" class="muted center">고른 조건에 맞는 종목이 없습니다.</td></tr>'}
          </tbody>
        </table></div>
        <p class="small muted">합계 행의 비중 = 전체 자산 대비, 종목 행의 비중 = 체크한 종목 합계 대비. 맨 왼쪽 체크를 끈 행은 합계에서 빠집니다 (체크 상태는 다른 화면에 다녀와도 유지). 자산군을 클릭하면 자산 현황의 해당 위치로 이동합니다.</p>
      </div>`;
    UI.bindFilters(main, st);
    // 표 안 스크롤 없이 페이지와 함께 스크롤: 머리글 · 합계 행은 맨 위 메뉴 줄 바로 아래에 붙음
    const hdr = document.getElementById('app-header'), thead = main.querySelector('.stats-tbl thead');
    main.style.setProperty('--hdr-h', (hdr ? hdr.offsetHeight : 0) + 'px');
    main.style.setProperty('--th-h', (thead ? thead.offsetHeight : 0) + 'px');
    // 행 체크박스 → 체크된 행만 맨 위 합계에 더함
    main.querySelectorAll('[data-row]').forEach(cb => cb.onchange = () => { cb.checked ? unchecked.delete(cb.dataset.row) : unchecked.add(cb.dataset.row); App.rerender(); });
    // 전체 선택 / 해제 체크박스 (합계 행 왼쪽). 일부만 체크 = 반쯤 표시
    main.querySelectorAll('.chk-all').forEach(cb => {
      cb.indeterminate = on.length > 0 && on.length < rows.length;
      cb.onchange = e => { rows.forEach(({ x }) => (e.target.checked ? unchecked.delete(rowKey(x)) : unchecked.add(rowKey(x)))); App.rerender(); };
    });
    saveCheck(); // 지금 체크 상태 기억 (다른 화면에 다녀와도 유지)
    main.querySelector('#p-save').onclick = () => saveDialog(on.map(({ x }) => rowKey(x)), rows.length);
    main.querySelector('#p-load').onclick = loadDialog;
    main.querySelector('#s-sort').onchange = e => {
      sortBy = e.target.value;
      try { localStorage.setItem(SORT_KEY, sortBy); } catch (err) { /* 무시 */ }
      App.rerender();
    };
  }

  // 저장 일시 (한국 시간) 2026-10-18 21:05
  const fmtAt = iso => { const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString(); return d.slice(0, 10) + ' ' + d.slice(11, 16); };

  // [Save]: 이름 · 설명을 붙여 지금 상태(필터 + 체크한 종목)를 서버에 저장. 같은 이름이면 덮어씀
  async function saveDialog(checkedKeys, total) {
    const list = await DataService.getStatsPresets();
    App.modal({
      title: '체크 상태 저장 (Save)',
      body: `<div class="form">
        <div class="small muted">지금 고른 대상(증권사 · 계좌 종류 · 자산군)과 체크한 종목 <b>${checkedKeys.length}/${total}개</b>를 저장합니다. 금액은 저장하지 않고, 불러올 때 그 시점 시세로 다시 계산합니다.</div>
        <div class="field"><label>이름</label><input type="text" id="sp-name" maxlength="40" value="${esc(loaded ? loaded.name : '')}" placeholder="예: 연금계좌 성장주" autocomplete="off"></div>
        <div class="field"><label>설명 <span class="muted small">(선택)</span></label><textarea id="sp-desc" maxlength="200" rows="3" placeholder="예: IRP · DC의 나스닥 종목만">${esc(loaded ? loaded.desc || '' : '')}</textarea></div>
        ${list.length ? `<div class="small muted">같은 이름으로 저장하면 덮어씁니다. 저장된 이름: ${list.map(p => esc(p.name)).join(', ')}</div>` : ''}
        <div class="notice" id="sp-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          const name = api.body.querySelector('#sp-name').value, desc = api.body.querySelector('#sp-desc').value;
          try {
            if (list.some(p => p.name === name.trim()) && !(await App.confirm(`<b>${esc(name.trim())}</b>이(가) 이미 있습니다. 덮어쓸까요?`, { okLabel: '덮어쓰기' }))) return;
            const saved = await DataService.saveStatsPreset({ name, desc, filters: { brokers: st.brokers, types: st.types, groups: st.groups }, checked: checkedKeys });
            loaded = { name: saved.name, desc: saved.desc, saved_at: saved.saved_at }; saveCheck();
            api.close();
            App.toast(`'${saved.name}'으로 저장했습니다 (${checkedKeys.length}개 종목).`);
          } catch (e) { const el = api.body.querySelector('#sp-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
  }

  // [Load]: 저장 목록(이름 · 설명 · 저장 일시) → [불러오기] 하면 그때의 필터와 체크를 되살림 (금액은 지금 시세 기준)
  async function loadDialog() {
    let list = (await DataService.getStatsPresets()).sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1));
    // 저장본 한 줄: 보기 / [수정]을 누르면 그 자리에서 이름 · 설명 고치기
    const view = p => `<div class="sp-main"><b>${esc(p.name)}</b> <span class="muted small">저장 ${esc(fmtAt(p.saved_at))} · ${p.checked.length}개 종목</span>
          ${p.desc ? `<div class="small sp-desc">${esc(p.desc)}</div>` : ''}</div>
        <div class="sp-act"><button type="button" class="btn btn-sm btn-primary" data-load="${esc(p.id)}">불러오기</button>
          <button type="button" class="btn btn-sm" data-edit="${esc(p.id)}">수정</button>
          <button type="button" class="btn btn-sm btn-ghost-danger" data-del="${esc(p.id)}">삭제</button></div>`;
    const edit = p => `<div class="sp-main form">
          <div class="field"><label>이름</label><input type="text" class="sp-e-name" maxlength="40" value="${esc(p.name)}" autocomplete="off"></div>
          <div class="field"><label>설명 <span class="muted small">(선택)</span></label><textarea class="sp-e-desc" maxlength="200" rows="3">${esc(p.desc || '')}</textarea></div>
          <div class="notice sp-e-err" hidden></div></div>
        <div class="sp-act"><button type="button" class="btn btn-sm btn-primary" data-esave="${esc(p.id)}">저장</button>
          <button type="button" class="btn btn-sm" data-ecancel="${esc(p.id)}">취소</button></div>`;
    const dlg = App.modal({
      title: '체크 상태 불러오기 (Load)', size: 'wide',
      body: list.length ? `<div class="sp-list">${list.map(p => `<div class="sp-item" data-id="${esc(p.id)}">${view(p)}</div>`).join('')}</div>`
        : '<div class="muted">저장된 체크 상태가 없습니다. 먼저 [Save]로 저장하세요.</div>',
      buttons: [{ label: '닫기' }]
    });
    const itemOf = id => dlg.body.querySelector(`.sp-item[data-id="${CSS.escape(id)}"]`);
    dlg.body.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      const id = b.dataset.load || b.dataset.edit || b.dataset.del || b.dataset.esave || b.dataset.ecancel;
      const p = list.find(x => x.id === id);
      if (!p) return;
      if (b.dataset.load) {
        ['brokers', 'types', 'groups'].forEach(k => { st[k] = Array.isArray(p.filters && p.filters[k]) ? p.filters[k].slice() : []; });
        try { localStorage.setItem(FILTER_KEY, JSON.stringify({ brokers: st.brokers, types: st.types, groups: st.groups })); } catch (err) { /* 무시 */ }
        pendingChecked = new Set(p.checked);
        loaded = { name: p.name, desc: p.desc, saved_at: p.saved_at };
        dlg.close();
        App.toast(`'${p.name}'을 불러왔습니다 (저장 ${fmtAt(p.saved_at)}). 금액은 지금 시세 기준입니다.`);
        App.rerender();
      } else if (b.dataset.edit) {
        itemOf(id).innerHTML = edit(p);
        itemOf(id).querySelector('.sp-e-name').focus();
      } else if (b.dataset.ecancel) {
        itemOf(id).innerHTML = view(p);
      } else if (b.dataset.esave) {
        const box = itemOf(id);
        try {
          const wasLoaded = loaded && loaded.name === p.name;
          const up = await DataService.updateStatsPreset(id, { name: box.querySelector('.sp-e-name').value, desc: box.querySelector('.sp-e-desc').value });
          list = list.map(x => (x.id === id ? up : x));
          if (wasLoaded) loaded = { ...loaded, name: up.name, desc: up.desc }; saveCheck();
          box.innerHTML = view(up);
          App.toast(`'${up.name}'으로 고쳤습니다.`);
        } catch (err) { const el = box.querySelector('.sp-e-err'); el.hidden = false; el.textContent = err.message; }
      } else if (b.dataset.del) {
        if (!(await App.confirm(`<b>${esc(p.name)}</b> 저장본을 지울까요?`, { okLabel: '삭제' }))) return;
        await DataService.deleteStatsPreset(p.id);
        list = list.filter(x => x.id !== id);
        if (loaded && loaded.name === p.name) loaded = null; saveCheck();
        itemOf(id).remove();
        App.toast(`'${p.name}'을 지웠습니다.`);
      }
    });
  }

  App.init('stats', render);
})();
