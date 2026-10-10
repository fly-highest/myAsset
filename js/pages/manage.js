// 계좌/자산관리 (manage.html)
// - 맨 위: 자산군별로 현재 어떤 종목이 매핑되어 있는지 표시
// - 하위 메뉴: 자산 구성 관리 / 계좌 관리 / 업로드
(function () {
  const st = { filterGroup: 'ALL', sortBy: 'default', collapsed: new Set() };
  const TABS = [['composition', '자산 구성 관리'], ['accounts', '계좌 관리'], ['upload', '업로드']];
  const hashTab = () => (TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : null);
  let tab = hashTab() || 'composition';

  async function render() {
    const { model, status, instruments } = await App.loadCurrentModel();
    const mode = App.mode;
    const main = document.getElementById('main');
    const heldCount = {};
    model.rows.forEach(x => { heldCount[x.inst.id] = (heldCount[x.inst.id] || 0) + 1; });

    let content = '';
    if (tab === 'composition') content = compositionTab(instruments, heldCount, await DataService.getCatalogInfo(), await DataService.getTargetPlans());
    else if (tab === 'accounts') content = accountsTab(model, mode);
    else content = uploadTab(status);

    main.innerHTML = `
      <div class="page-hd">
        <div><h1>계좌/자산관리</h1><p class="desc">자산군에 속하는 종목과 계좌별 보유 내역을 관리합니다. 저장하면 모든 화면에 바로 반영되고, 이력에는 다음 08:00 스냅샷에 저장됩니다.</p></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec">
        <div class="sec-hd"><h2>자산군별 종목 매핑</h2><div class="toolbar"><span class="small muted">진한 글씨 = 보유 중 · 흐린 글씨 = 매핑만 되어 있고 보유 없음</span><button type="button" class="btn btn-sm" data-group-edit title="자산군을 추가·삭제하거나 이름·색·순서를 바꿉니다">자산군 추가/삭제</button></div></div>
        ${mappingSummary(instruments, heldCount)}
      </div>
      <div class="sec">
        <div class="tabs sub-tabs">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${content}
      </div>`;

    main.querySelectorAll('[data-group-edit]').forEach(b => b.onclick = () => groupEditor());
    main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); App.rerender(); });
    if (tab === 'composition') bindComposition(main, instruments);
    else if (tab === 'accounts') {
      UI.bindTree(main, model, st);
      main.querySelector('#btn-add-acc').onclick = () => accountForm();
      main.querySelector('#btn-export').onclick = () => DataService.exportHoldingsXlsx();
      main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => onAction(b.dataset.act, b.dataset.id, model));
    } else bindUpload(main);
  }
  window.addEventListener('hashchange', () => { const t = hashTab(); if (t && t !== tab) { tab = t; App.rerender(); } });

  // ---------------- 자산군별 종목 매핑 요약 ----------------
  function mappingSummary(instruments, heldCount) {
    const chip = i => `<span class="chip-inst ${heldCount[i.id] ? 'held' : ''}" title="${esc(i.symbol)} · ${esc(i.exchange)} · ${esc(i.currency)}${heldCount[i.id] ? ` · ${heldCount[i.id]}개 계좌 보유` : ' · 보유 없음'}">${esc(i.name)}</span>`;
    const cards = Groups.list.map(g => {
      const list = instruments.filter(i => i.asset_group === g.code);
      return `<div class="map-card"><div class="map-hd"><span class="dot" style="background:${g.color}"></span><b>${g.name}</b> <span class="muted small">${list.length}종목</span></div>
        <div class="map-body">${list.map(chip).join('') || '<span class="muted small">매핑된 종목 없음</span>'}</div></div>`;
    });
    const un = instruments.filter(i => !i.asset_group);
    cards.push(`<div class="map-card unassigned"><div class="map-hd"><b>미지정</b> <span class="muted small">${un.length}종목 · 기타종목으로 집계</span></div>
      <div class="map-body">${un.map(chip).join('') || '<span class="muted small">없음</span>'}</div></div>`);
    return `<div class="map-grid">${cards.join('')}</div>`;
  }

  // ---------------- 자산 구성 관리 ----------------
  function compositionTab(instruments, heldCount, cat, plans) {
    // 추종 통화 · 자산 성향 표시 (거래 통화와 같거나 기본값이면 흐리게)
    const trackCell = i => { const t = TrackCur.of(i); return t === i.currency ? `<span class="muted">${esc(t)}</span>` : `<b>${esc(t)}</b>`; };
    const styleCell = i => { const s = Styles.effective(i); return Styles.isDefault(i) ? `<span class="muted" title="자산유형으로 정한 기본값">${esc(Styles.name(s))}</span>` : esc(Styles.name(s)); };
    const row = (i, assigned) => `<tr>
      <td class="nm">${esc(i.name)} <span class="muted small">${esc(i.eng_name || '')}</span></td>
      <td class="sym">${esc(i.symbol)}<small>${esc(i.exchange)}</small></td>
      <td>${esc(i.asset_type)}</td><td>${esc(i.currency)}</td><td>${trackCell(i)}</td><td>${styleCell(i)}</td>
      <td class="num">${heldCount[i.id] ? `${heldCount[i.id]}개 계좌` : '<span class="muted">보유 없음</span>'}</td>
      <td class="actions">${assigned
        ? `<button type="button" class="btn btn-sm" data-move="${esc(i.id)}" title="자산군 · 추종 통화 · 자산 성향 변경">자산군 변경</button><button type="button" class="btn btn-sm btn-ghost-danger" data-remove="${esc(i.id)}">제거</button>`
        : `<select class="inline" data-assign="${esc(i.id)}"><option value="">자산군 지정…</option>${Groups.list.map(g => `<option value="${g.code}">${g.name}</option>`).join('')}</select><button type="button" class="btn btn-sm" data-move="${esc(i.id)}" title="자산군 · 추종 통화 · 자산 성향 변경">자산군 변경</button>`}</td>
    </tr>`;
    const blocks = Groups.list.map(g => {
      const list = instruments.filter(i => i.asset_group === g.code);
      return `<tbody>
        <tr class="g-row" id="comp-${g.code}"><td colspan="7"><span class="dot" style="background:${g.color}"></span>${g.name} <span class="muted small">${list.length}종목</span></td>
          <td class="actions"><button type="button" class="btn btn-sm" data-target-group="${g.code}" title="기준별 이 자산군의 목표 비중(%)을 수정합니다">목표 % 수정</button> <button type="button" class="btn btn-sm btn-primary" data-add-to="${g.code}">+ 종목 추가</button></td></tr>
        ${list.map(i => row(i, true)).join('') || '<tr><td colspan="8" class="muted">아직 종목이 없습니다</td></tr>'}
      </tbody>`;
    }).join('');
    const un = instruments.filter(i => !i.asset_group);
    return `
      ${targetCard(plans)}
      <div class="card pad catalog-bar">
        <div><b>전체 상장 종목 목록</b> <span class="muted">${Fmt.plain(cat.count)}개 종목 · 마지막 갱신 ${cat.syncedAt ? Fmt.mdhm(cat.syncedAt) : '—'} · 다음 자동 갱신 ${Fmt.mdhm(cat.nextSyncAt)}</span>
          <div class="small muted">국내 주식(KRX KIND)·국내 ETF(네이버)·미국 주식·ETF(NASDAQ 공개 파일)·업비트 코인 목록을 매월 1일 받아 DB에 저장하고, [종목 추가] 검색은 이 목록을 조회합니다.</div></div>
        <button type="button" class="btn" id="btn-sync" title="전체 상장 종목 목록을 지금 다시 받아오고, 등록된 종목의 이름도 새 이름으로 바꿉니다">↻ 목록 최신화</button>
      </div>
      <p class="small muted">종목을 자산군에 <b>추가</b>하거나 <b>제거</b>해도 종목과 보유 내역은 지워지지 않고 자산군 분류만 바뀝니다. 한 종목을 옮기면 그 종목을 가진 모든 계좌의 보유분이 함께 옮겨집니다.</p>
      <div class="tbl-wrap"><table class="tbl comp-tbl">
        <thead><tr><th>종목명</th><th>심볼</th><th>자산유형</th><th>거래 통화</th><th>추종 통화</th><th>자산 성향</th><th class="num">보유</th><th>관리</th></tr></thead>
        ${blocks}
        <tbody>
          <tr class="g-row"><td colspan="8">미지정 <span class="muted small">${un.length}종목 · 자산군을 지정하지 않아 기타종목으로 집계됩니다</span></td></tr>
          ${un.map(i => row(i, false)).join('') || '<tr><td colspan="8" class="muted">없음</td></tr>'}
        </tbody>
      </table></div>`;
  }

  function bindComposition(main, instruments) {
    main.querySelector('#btn-sync').onclick = async () => {
      const btn = main.querySelector('#btn-sync');
      btn.disabled = true; btn.textContent = '최신화 중… (최대 1분)';
      try {
        const r = await DataService.syncCatalog();
        App.toast(r.renamed.length ? `목록을 최신화했습니다 (${Fmt.plain(r.count)}개). 종목명 변경 ${r.renamed.length}건: ${r.renamed.map(x => `${x.from} → ${x.to}`).join(', ')}` : `목록을 최신화했습니다 (${Fmt.plain(r.count)}개). 바뀐 종목명은 없습니다.`);
      } catch (e) { App.toast(e.message, 'error'); btn.disabled = false; btn.textContent = '↻ 목록 최신화'; }
    };
    main.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
      const inst = instruments.find(i => i.id === b.dataset.remove);
      const ok = await App.confirm(`<b>${esc(inst.name)}</b>을(를) ${Groups.name(inst.asset_group)}에서 제거할까요?<br><small>종목 자체는 삭제되지 않으며 자산군 분류만 해제됩니다. (기타종목으로 집계되고 '미지정'으로 표시됩니다)</small>`, { okLabel: '제거', danger: true });
      if (!ok) return;
      await DataService.updateInstrumentGroup(inst.id, null);
      App.toast(`${inst.name}의 자산군 분류를 해제했습니다.`);
    });
    main.querySelectorAll('[data-assign]').forEach(sel => sel.onchange = async () => {
      if (!sel.value) return;
      const inst = instruments.find(i => i.id === sel.dataset.assign);
      await DataService.updateInstrumentGroup(inst.id, sel.value);
      App.toast(`${inst.name} → ${Groups.name(sel.value)}`);
    });
    main.querySelectorAll('[data-move]').forEach(b => b.onclick = () => groupPicker(instruments.find(i => i.id === b.dataset.move)));
    main.querySelectorAll('[data-add-to]').forEach(b => b.onclick = () => addToGroup(b.dataset.addTo));
    bindTargets(main);
  }

  // ---------------- 목표 비중 (투자 화면에서 사용) ----------------
  // 기준(예: 200일선 +1% 이상)마다 자산군별 목표 %. 기준 행의 [수정]으로 이름·전체 %를, 자산군 행의 [목표 % 수정]으로 그 자산군만 수정
  function targetCard(plans) {
    const head = Groups.list.map(g => `<th class="num"><span class="dot" style="background:${g.color}"></span>${g.name}</th>`).join('');
    const rows = plans.map(p => `<tr>
      <td class="nm">${esc(p.name)}</td>
      ${Groups.list.map(g => `<td class="num">${Fmt.weight(p.weights[g.code] || 0)}</td>`).join('')}
      <td class="num ${p.sum !== 100 ? 'warn-text' : ''}"><b>${Fmt.weight(p.sum)}</b>${p.sum !== 100 ? '<div class="sub">100%가 아님</div>' : ''}</td>
      <td class="actions"><button type="button" class="btn btn-sm" data-plan-edit="${esc(p.id)}">수정</button><button type="button" class="btn btn-sm btn-ghost-danger" data-plan-del="${esc(p.id)}">삭제</button></td>
    </tr>`).join('') || `<tr><td colspan="${Groups.list.length + 3}" class="muted">기준이 없습니다. [+ 기준 추가]로 만들어 주세요.</td></tr>`;
    return `
      <div class="sec-hd" style="margin-top:0"><h2>목표 비중</h2>
        <div class="toolbar"><span class="small muted">투자 화면에서 기준별 목표 금액과 매수·매도 필요 금액을 계산합니다</span>
          <button type="button" class="btn btn-sm" data-group-edit>자산군 추가/삭제</button>
          <button type="button" class="btn btn-sm btn-primary" id="plan-add">+ 기준 추가</button>
          <button type="button" class="btn btn-sm btn-ghost" id="plan-reset" title="처음 기본값으로 되돌립니다">기본값으로</button></div></div>
      <div class="tbl-wrap" style="margin-bottom:18px"><table class="tbl">
        <thead><tr><th>기준</th>${head}<th class="num">합계</th><th>관리</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }
  function bindTargets(main) {
    main.querySelector('#plan-add').onclick = () => planForm(null);
    main.querySelector('#plan-reset').onclick = async () => {
      if (!(await App.confirm('목표 비중을 처음 기본값(200일선 +1% 이상 / −1% 이하)으로 되돌릴까요?', { okLabel: '되돌리기', danger: true }))) return;
      await DataService.resetTargetPlans();
      App.toast('목표 비중을 기본값으로 되돌렸습니다.');
    };
    main.querySelectorAll('[data-plan-edit]').forEach(b => b.onclick = async () => {
      const plan = (await DataService.getTargetPlans()).find(p => p.id === b.dataset.planEdit);
      planForm(plan);
    });
    main.querySelectorAll('[data-plan-del]').forEach(b => b.onclick = async () => {
      const plan = (await DataService.getTargetPlans()).find(p => p.id === b.dataset.planDel);
      if (!(await App.confirm(`<b>${esc(plan.name)}</b> 기준을 삭제할까요?`, { okLabel: '삭제', danger: true }))) return;
      await DataService.deleteTargetPlan(plan.id);
      App.toast('기준을 삭제했습니다.');
    });
    main.querySelectorAll('[data-target-group]').forEach(b => b.onclick = () => groupTargetForm(b.dataset.targetGroup));
  }
  // 합계 표시 (입력할 때마다 갱신)
  const sumLine = inputs => {
    const s = Math.round([...inputs].reduce((a, el) => a + (Number(el.value) || 0), 0) * 100) / 100;
    return `합계 <b class="${s === 100 ? '' : 'warn-text'}">${Fmt.weight(s)}</b>${s === 100 ? '' : ' — 100%가 되도록 맞추는 것을 권장합니다'}`;
  };
  // 기준 추가·수정: 이름 + 7개 자산군 목표 %
  function planForm(plan) {
    const w = plan ? plan.weights : {};
    App.modal({
      title: plan ? '기준 수정' : '기준 추가', size: 'mid',
      body: `<div class="form">
        <div class="field"><label>기준 이름</label><input type="text" id="p-name" value="${esc(plan ? plan.name : '')}" placeholder="예: 200일선 +1% 이상"></div>
        <div class="target-grid">${Groups.list.map(g => `
          <div class="field"><label><span class="dot" style="background:${g.color}"></span>${g.name}</label>
            <div class="input-unit"><input type="number" step="any" min="0" max="100" data-w="${g.code}" value="${w[g.code] ?? 0}"><span>%</span></div></div>`).join('')}
        </div>
        <div class="small" id="p-sum"></div>
        <div class="notice" id="p-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          const weights = {};
          api.body.querySelectorAll('[data-w]').forEach(el => { weights[el.dataset.w] = el.value; });
          try {
            await DataService.saveTargetPlan({ id: plan && plan.id, name: api.body.querySelector('#p-name').value, weights });
            api.close(); App.toast('목표 비중을 저장했습니다.');
          } catch (e) { const el = api.body.querySelector('#p-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
    const body = document.querySelector('.modal-backdrop:last-child .modal-bd');
    const inputs = body.querySelectorAll('[data-w]');
    const upd = () => { body.querySelector('#p-sum').innerHTML = sumLine(inputs); };
    inputs.forEach(el => el.addEventListener('input', upd));
    upd();
  }
  // 자산군 하나의 목표 %를 기준별로 수정
  async function groupTargetForm(code) {
    const plans = await DataService.getTargetPlans();
    if (!plans.length) { App.alert('먼저 [+ 기준 추가]로 기준을 만들어 주세요.'); return; }
    App.modal({
      title: `${Groups.name(code)} 목표 비중 수정`,
      body: `<div class="form">
        <p class="small muted" style="margin:0">기준별로 ${Groups.name(code)}의 목표 비중(%)을 입력하세요. 오른쪽은 그 기준의 다른 자산군을 합친 값입니다.</p>
        ${plans.map(p => {
          const others = Math.round((p.sum - (p.weights[code] || 0)) * 100) / 100;
          return `<div class="field"><label>${esc(p.name)}</label>
            <div class="toolbar"><div class="input-unit" style="width:140px"><input type="number" step="any" min="0" max="100" data-plan="${esc(p.id)}" data-others="${others}" value="${p.weights[code] || 0}"><span>%</span></div>
            <span class="small muted" data-sum-for="${esc(p.id)}"></span></div></div>`;
        }).join('')}
        <div class="notice" id="g-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          const values = {};
          api.body.querySelectorAll('[data-plan]').forEach(el => { values[el.dataset.plan] = el.value; });
          try { await DataService.setGroupTargets(code, values); api.close(); App.toast(`${Groups.name(code)} 목표 비중을 저장했습니다.`); }
          catch (e) { const el = api.body.querySelector('#g-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
    const body = document.querySelector('.modal-backdrop:last-child .modal-bd');
    body.querySelectorAll('[data-plan]').forEach(el => {
      const upd = () => {
        const s = Math.round(((Number(el.value) || 0) + Number(el.dataset.others)) * 100) / 100;
        body.querySelector(`[data-sum-for="${el.dataset.plan}"]`).innerHTML = `이 기준 합계 <b class="${s === 100 ? '' : 'warn-text'}">${Fmt.weight(s)}</b>`;
      };
      el.addEventListener('input', upd);
      upd();
    });
  }

  // ---------------- 자산군 편집 (추가 · 이름/색 수정 · 순서 · 삭제) ----------------
  function groupEditor() {
    const m = App.modal({ title: '자산군 추가/삭제', size: 'mid', body: '', buttons: [{ label: '닫기', kind: 'primary' }] });
    let editing = null, draft = null; // [수정]으로 펼친 자산군 코드, 입력 중인 이름·색 (종목 추가·제거 후에도 유지)
    // [수정]: 이름·색 변경 + 이 자산군에 속한 종목 추가·제거 (종목 자체·보유 내역은 지워지지 않고 자산군 분류만 바뀜)
    function editPanel(g, list) {
      const d = draft || { name: g.name, color: g.color };
      return `<div class="g-edit">
        <div class="toolbar"><input type="color" data-e-color value="${d.color}" style="width:44px;padding:2px"><input type="text" data-e-name value="${esc(d.name)}" style="flex:1;width:auto">
          <button type="button" class="btn btn-sm btn-primary" data-ok>이름·색 저장</button><button type="button" class="btn btn-sm" data-cancel>닫기</button></div>
        <div class="g-members">
          <div class="small muted" style="margin-bottom:6px">이 자산군의 종목 <b>${list.length}</b>개 — [×]로 빼면 미지정(기타종목으로 집계)이 됩니다. 바로 저장됩니다.</div>
          <div class="g-chips">${list.map(i => `<span class="chip-inst held g-chip" title="${esc(i.symbol)} · ${esc(i.exchange)} · ${esc(i.currency)}">${esc(i.name)}${i.symbol !== i.name ? ` <small class="muted">${esc(i.symbol)}</small>` : ''}<button type="button" class="x-mini" data-rm="${esc(i.id)}" title="이 자산군에서 빼기">×</button></span>`).join('') || '<span class="muted small">종목이 없습니다</span>'}</div>
          <button type="button" class="btn btn-sm btn-primary" data-add-inst style="margin-top:8px">+ 종목 추가</button>
        </div></div>`;
    }
    function bindEdit(li, g, list, showErr) {
      const color = li.querySelector('[data-e-color]'), name = li.querySelector('[data-e-name]');
      const keep = () => { draft = { name: name.value, color: color.value }; };
      const save = async () => {
        try { await DataService.updateGroup(g.code, { name: name.value, color: color.value }); App.toast('자산군 이름·색을 저장했습니다.'); editing = null; draft = null; draw(); }
        catch (e) { showErr(e.message); }
      };
      li.querySelector('[data-ok]').onclick = save;
      li.querySelector('[data-cancel]').onclick = () => { editing = null; draft = null; draw(); };
      name.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); editing = null; draw(); } };
      li.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
        keep();
        const inst = list.find(i => i.id === b.dataset.rm);
        await DataService.updateInstrumentGroup(inst.id, null);
        App.toast(`${inst.name}을(를) ${g.name}에서 뺐습니다 (미지정).`);
        draw();
      });
      li.querySelector('[data-add-inst]').onclick = async () => { keep(); await addToGroup(g.code); draw(); };
    }
    async function draw() {
      const [groups, insts] = await Promise.all([DataService.getGroups(), DataService.getInstruments()]);
      const members = {};
      insts.forEach(i => { if (i.asset_group) (members[i.asset_group] = members[i.asset_group] || []).push(i); });
      m.body.innerHTML = `
        <p class="small muted" style="margin-top:0">자산군을 추가하면 모든 화면의 표·차트와 목표 비중에 칸이 생깁니다(목표 비중은 0%로 시작). 삭제하면 그 자산군의 종목은 <b>미지정</b>(기타종목으로 집계)이 되고, 기준별 목표 비중에서 그 몫이 빠집니다. 기타종목은 미지정 종목이 모이는 곳이라 삭제할 수 없습니다.</p>
        <ul class="comp-list grp-list">${groups.map((g, i) => `
          <li data-code="${esc(g.code)}" class="${editing === g.code ? 'editing' : ''}">
            <div class="g-line">
            <span class="m-name"><span class="dot" style="background:${g.color}"></span>${esc(g.name)} <span class="muted small">· ${g.count}종목</span></span>
            <span><button type="button" class="btn btn-sm" data-up ${i === 0 ? 'disabled' : ''} title="위로">▲</button><button type="button" class="btn btn-sm" data-down ${i === groups.length - 1 ? 'disabled' : ''} title="아래로">▼</button><button type="button" class="btn btn-sm ${editing === g.code ? 'btn-primary' : ''}" data-edit title="이름·색 변경, 종목 추가·제거">수정</button>${g.code === Groups.FALLBACK ? '' : '<button type="button" class="btn btn-sm btn-ghost-danger" data-del>삭제</button>'}</span>
            </div>
            ${editing === g.code ? editPanel(g, members[g.code] || []) : ''}
          </li>`).join('')}
        </ul>
        <div class="toolbar" style="margin-top:8px"><input type="color" id="g-new-color" value="#e05e9b" title="색상" style="width:44px;padding:2px"><input type="text" id="g-new" placeholder="새 자산군 이름 (예: 채권)" style="flex:1;width:auto"><button type="button" class="btn btn-primary btn-sm" id="g-add">추가</button></div>
        <div class="notice" id="g-err" hidden></div>`;
      const showErr = msg => { const el = m.body.querySelector('#g-err'); el.hidden = !msg; el.textContent = msg || ''; };
      const input = m.body.querySelector('#g-new');
      const add = async () => {
        try { const g = await DataService.addGroup({ name: input.value, color: m.body.querySelector('#g-new-color').value }); App.toast(`'${g.name}' 자산군을 추가했습니다.`); draw(); }
        catch (e) { showErr(e.message); }
      };
      m.body.querySelector('#g-add').onclick = add;
      input.onkeydown = e => { if (e.key === 'Enter') add(); };
      m.body.querySelectorAll('li[data-code]').forEach(li => {
        const g = groups.find(x => x.code === li.dataset.code);
        li.querySelector('[data-up]').onclick = async () => { await DataService.moveGroup(g.code, -1); draw(); };
        li.querySelector('[data-down]').onclick = async () => { await DataService.moveGroup(g.code, 1); draw(); };
        li.querySelector('[data-edit]').onclick = () => { editing = editing === g.code ? null : g.code; draft = null; draw(); };
        if (editing === g.code) bindEdit(li, g, members[g.code] || [], showErr);
        const del = li.querySelector('[data-del]');
        if (del) del.onclick = async () => {
          const plans = (await DataService.getTargetPlans()).filter(p => p.weights[g.code]);
          const msg = `<b>${esc(g.name)}</b> 자산군을 삭제할까요?<br><small>`
            + (g.count ? `이 자산군의 종목 ${g.count}개는 지워지지 않고 <b>미지정</b>(기타종목으로 집계)이 됩니다.<br>` : '')
            + (plans.length ? `목표 비중에서 이 몫이 빠집니다: ${plans.map(p => `${esc(p.name)} ${Fmt.weight(p.weights[g.code])}`).join(', ')} → 합계를 다시 100%로 맞춰 주세요.<br>` : '')
            + '지난 이력에서는 기타종목에 합쳐서 보입니다.</small>';
          if (!(await App.confirm(msg, { okLabel: '삭제', danger: true }))) return;
          try { await DataService.deleteGroup(g.code); App.toast(`'${g.name}' 자산군을 삭제했습니다.`); draw(); }
          catch (e) { showErr(e.message); }
        };
      });
    }
    draw();
  }

  // 종목 속성 팝업 ([자산군 변경]): 자산군 · 추종 통화 · 자산 성향 — 고른 뒤 [저장]
  // (자산 구성 관리 표 · 계좌 관리 표의 종목 행에서 열림. 이 종목을 가진 모든 계좌에 적용)
  function groupPicker(inst) {
    const sel = {
      group: inst.asset_group && Groups.has(inst.asset_group) ? inst.asset_group : '',
      track: TrackCur.of(inst),
      style: Styles.normalize(inst.style) || ''
    };
    // 미리 정한 혼합(성50배50·성55배45)이 아닌 혼합은 '혼합 직접 입력'으로 보여 줌
    const mm = String(sel.style).match(/^MIX_(\d+)$/);
    sel.mix = mm ? +mm[1] : 60;
    if (mm && !Styles.PRESET_MIX.includes(sel.mix)) sel.style = 'MIX';
    const opt = (kind, code, label, color, extra = '') => `<button type="button" class="btn ${sel[kind] === code ? 'on' : ''}" data-${kind}="${code}">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(label)}${extra}</button>`;
    const defStyle = Styles.effective({ ...inst, style: null });
    const m = App.modal({
      title: '종목 속성 — 자산군 · 추종 통화 · 자산 성향', size: 'mid', body: '',
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          let style = sel.style;
          if (style === 'MIX') {
            const g = Number(api.body.querySelector('#mix-g').value);
            if (!(g > 0 && g < 100 && Number.isInteger(g))) { const el = api.body.querySelector('#gp-err'); el.hidden = false; el.textContent = '혼합 성향의 성장 비율은 1~99 사이 정수로 입력해 주세요.'; return; }
            style = 'MIX_' + g;
          }
          try {
            await DataService.updateInstrumentAttrs(inst.id, { asset_group: sel.group || null, track_currency: sel.track, style: style || null });
            api.close();
            App.toast(`${inst.name}: ${sel.group ? Groups.name(sel.group) : '자산군 미지정'} · 추종 ${sel.track} · ${style ? Styles.name(style) : '성향 기본값'}`);
          } catch (e) { const el = api.body.querySelector('#gp-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
    function draw() {
      const isMix = sel.style === 'MIX', g = sel.mix;
      m.body.innerHTML = `<p style="margin-top:0"><b>${esc(inst.name)}</b> <span class="muted small">${esc(inst.symbol)} · ${esc(inst.exchange)} · 거래 통화 ${esc(inst.currency)}</span></p>
        <p class="small muted">이 종목을 가진 <b>모든 계좌</b>에 적용됩니다. 종목·보유 내역은 그대로이고 분류만 바뀝니다.</p>
        <h3 class="sec-sub">자산군</h3>
        <div class="gp-list">${Groups.list.map(x => opt('group', x.code, x.name, x.color)).join('')}${opt('group', '', '미지정 (기타종목으로 집계)')}</div>
        <h3 class="sec-sub">추종 통화 <span class="muted small">— 가격이 따라가는 통화 (예: 원화로 사는 미국 ETF = USD)</span></h3>
        <div class="gp-list">${TrackCur.list.map(x => opt('track', x.code, x.name, x.color, x.code === inst.currency ? ' <span class="muted small">(거래 통화와 같음)</span>' : '')).join('')}</div>
        <h3 class="sec-sub">자산 성향</h3>
        <div class="gp-list">
          ${Styles.list.map(x => opt('style', x.code, x.name, x.color)).join('')}
          ${Styles.PRESET_MIX.map(p => opt('style', 'MIX_' + p, `${Styles.name('MIX_' + p)}`, '', ` <span class="muted small">(성장 ${p}% · 배당 ${100 - p}%)</span>`)).join('')}
          <button type="button" class="btn ${isMix ? 'on' : ''}" data-style="MIX">혼합 직접 입력</button>
          ${opt('style', '', `기본값 (${Styles.name(defStyle)})`, '', ' <span class="muted small">자산유형으로 정함</span>')}
        </div>
        <div class="toolbar" id="mix-box" style="margin-top:8px" ${isMix ? '' : 'hidden'}>성장 <div class="input-unit" style="width:110px"><input type="number" id="mix-g" min="1" max="99" step="1" value="${g}"><span>%</span></div>
          · 배당 <b id="mix-d">${100 - g}%</b> <span class="muted small">→ 통계에서 성장·배당에 비율대로 나눠 합산</span></div>
        <div class="notice" id="gp-err" hidden></div>`;
      ['group', 'track', 'style'].forEach(kind => m.body.querySelectorAll(`[data-${kind}]`).forEach(b => b.onclick = () => {
        sel[kind] = b.dataset[kind];
        draw();
      }));
      const mg = m.body.querySelector('#mix-g');
      mg.oninput = () => { const v = Number(mg.value); sel.mix = v; m.body.querySelector('#mix-d').textContent = v > 0 && v < 100 ? (100 - v) + '%' : '—'; };
    }
    draw();
  }

  async function addToGroup(code) {
    const pick = await UI.pickInstrument({ title: `${Groups.name(code)}에 종목 추가`, confirmLabel: '추가', allowNew: true, note: '등록된 종목과 전체 상장 종목 목록(현금·RP 포함)에서 검색합니다.' });
    if (!pick) return;
    if (pick.__new) {
      const created = await newInstrumentForm(code); // 직접 등록 시 이 자산군으로 바로 지정됨
      if (created) App.toast(`${created.name} 등록 → ${Groups.name(created.asset_group) || '미지정'}`);
      return;
    }
    const inst = pick;
    if (inst.asset_group === code) { await App.alert(`<b>${esc(inst.name)}</b>은(는) 이미 ${Groups.name(code)}에 있습니다.`); return; }
    if (inst.asset_group) {
      const ok = await App.confirm(`이 자산을 현재 자산군으로 이동하시겠습니까?<br><small><b>${esc(inst.name)}</b>: ${Groups.name(inst.asset_group)} → ${Groups.name(code)}<br>이 종목을 보유한 모든 계좌의 보유분이 함께 이동합니다.</small>`, { okLabel: '이동' });
      if (!ok) return;
    }
    await DataService.updateInstrumentGroup(inst.id, code);
    App.toast(`${inst.name} → ${Groups.name(code)}`);
  }

  // ---------------- 계좌 관리 ----------------
  function accountsTab(model, mode) {
    return `
      <div class="toolbar" style="margin-bottom:10px">
        <button type="button" class="btn btn-primary" id="btn-add-acc">+ 계좌 추가</button>
        <button type="button" class="btn" id="btn-export">엑셀 다운로드</button>
        <span class="small muted">받은 엑셀을 고쳐서 [업로드] 메뉴로 올리면 그 내용이 현재 계좌 현황이 됩니다.</span>
      </div>
      ${UI.treeSection(model, mode, st, { editable: true, byBroker: true, showUpdated: true })}`;
  }

  // ---------------- 업로드 ----------------
  function uploadTab(status) {
    return `
      <div class="card pad upload-card">
        <h3 style="margin-top:0">엑셀 업로드로 계좌 현황 한 번에 바꾸기</h3>
        <ol class="steps-list">
          <li><a href="#accounts" data-goto="accounts">계좌 관리</a>에서 <b>[엑셀 다운로드]</b>로 지금 현황 파일을 받습니다.</li>
          <li>엑셀에서 수량·평균매입가 등을 고치거나 줄을 추가·삭제합니다. <b>증권사·계좌종류는 드롭다운</b>에서 고르고, <b>심볼만 입력하면 종목명·거래소·자산유형·통화가 자동</b>으로 채워집니다.</li>
          <li>아래 <b>[XLSX 업로드]</b>로 올리고, 점검 결과와 미리보기를 확인한 뒤 <b>[반영]</b>합니다.</li>
        </ol>
        <div class="notice">올리면 먼저 <b>DB 정보(종목·증권 마스터)와 맞는지 검사</b>하고, 다른 값이 하나라도 있으면 그 값을 보여 주고 <b>반영하지 않습니다</b>. 이상이 없으면 업로드한 파일 = <b>현재 최종 계좌 현황</b>이 됩니다. 추가·삭제를 골라서 하는 것이 아니라, 파일 내용으로 계좌·보유 전체가 바뀝니다. 파일에 없는 계좌·종목은 현재 현황에서 빠집니다. (과거 이력은 바뀌지 않습니다)</div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" id="btn-upload">XLSX 업로드</button>
          ${status.canUndo ? '<button type="button" class="btn btn-ghost-danger" id="btn-undo" title="다음 스냅샷 전까지 가능">직전 상태로 되돌리기</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-sample" title="가상 데이터가 들어 있는 테스트용 파일">테스트용 샘플 파일 받기</button>
        </div>
      </div>`;
  }
  function bindUpload(main) {
    main.querySelector('#btn-upload').onclick = () => uploadFlow();
    main.querySelector('#btn-sample').onclick = () => DataService.downloadSampleXlsx(Fmt.todayKST());
    const g = main.querySelector('[data-goto]');
    if (g) g.onclick = e => { e.preventDefault(); tab = 'accounts'; history.replaceState(null, '', '#accounts'); App.rerender(); };
    const undo = main.querySelector('#btn-undo');
    if (undo) undo.onclick = async () => {
      if (!(await App.confirm('XLSX 업로드 직전 상태로 되돌릴까요?', { okLabel: '되돌리기', danger: true }))) return;
      await DataService.undoLastImport();
      App.toast('업로드 직전 상태로 되돌렸습니다.');
    };
  }

  async function onAction(act, id, model) {
    const acc = model.accounts.find(a => a.id === id);
    if (act === 'add-holding') return addHoldingFlow(acc.account);
    if (act === 'edit-account') return accountForm(acc.account);
    if (act === 'delete-account') {
      if (acc.rows.length) return App.alert('보유 종목을 먼저 정리해 주세요.<br><small>보유 종목이 남아 있는 계좌는 삭제할 수 없습니다.</small>', '계좌 삭제 불가');
      if (!(await App.confirm(`<b>${esc(acc.name)}</b> 계좌를 삭제할까요?<br><small>과거 이력의 계좌명은 스냅샷에 고정되어 그대로 유지됩니다.</small>`, { okLabel: '삭제', danger: true }))) return;
      try { await DataService.deleteAccount(id); App.toast('계좌를 삭제했습니다.'); }
      catch (e) { App.alert(esc(e.message)); }
      return;
    }
    const x = model.rows.find(r => r.holding.id === id);
    if (act === 'set-group') return groupPicker(x.inst);
    const account = model.accounts.find(a => a.key === x.accKey).account;
    if (act === 'edit-holding') return holdingForm({ account, inst: x.inst, holding: x.holding });
    if (act === 'delete-holding') {
      const ok = await App.confirm(`<b>${esc(account.name)}</b> 계좌의 <b>${esc(x.inst.name)}</b> 보유를 삭제할까요?<br><small>이 계좌에서 해당 종목 보유 내역이 삭제됩니다. 다른 계좌의 보유와 과거 이력은 유지됩니다.</small>`, { okLabel: '삭제', danger: true });
      if (!ok) return;
      await DataService.deleteHolding(id);
      App.toast('보유 내역을 삭제했습니다.');
    }
  }

  // ---------------- 계좌 추가/수정 ----------------
  // 증권사·계좌종류는 증권 마스터에 등록된 값 중에서 선택합니다. 비고는 자유롭게 입력.
  async function accountForm(account) {
    const m = App.modal({
      title: account ? '계좌 수정' : '계좌 추가', size: 'mid',
      body: `<div class="form">
        <div class="field"><label>계좌명</label><input type="text" id="a-name" value="${esc(account ? account.name : '')}" placeholder="예: 키움 일반"></div>
        <div class="row2">
          <div class="field"><label>증권사</label><select id="a-broker"></select></div>
          <div class="field"><label>계좌종류</label><select id="a-type"></select></div>
        </div>
        <div class="master-hint small muted">찾는 증권사·계좌종류가 없나요? <button type="button" class="btn btn-sm" id="a-master">증권 마스터 수정</button></div>
        <div class="field"><label>비고</label><textarea id="a-memo" rows="3" maxlength="300" placeholder="예: 2025년 개설, 의무가입 3년 / 적립식 매수 계좌">${esc(account ? account.memo || '' : '')}</textarea>
          <div class="hint">계좌 현황·계좌 관리·Dashboard 의 계좌 이름 아래에 표시됩니다.</div></div>
        <div class="notice" id="a-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          const b = api.body;
          const data = { name: b.querySelector('#a-name').value, broker_id: b.querySelector('#a-broker').value, account_type_id: b.querySelector('#a-type').value, memo: b.querySelector('#a-memo').value };
          try {
            account ? await DataService.updateAccount(account.id, data) : await DataService.addAccount(data);
            api.close(); App.toast(account ? '계좌를 수정했습니다.' : '계좌를 추가했습니다.');
          } catch (e) { const el = b.querySelector('#a-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
    // 선택 목록 채우기 (증권 마스터를 고친 뒤에도 다시 채움, 고르던 값은 유지)
    async function fill(keepBroker, keepType) {
      const [brokers, types] = await Promise.all([DataService.getBrokers(), DataService.getAccountTypes()]);
      m.body.querySelector('#a-broker').innerHTML = '<option value="">증권사 선택</option>' +
        brokers.map(x => `<option value="${esc(x.id)}" ${x.id === keepBroker ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
      m.body.querySelector('#a-type').innerHTML = '<option value="">계좌종류 선택 (선택 사항)</option>' +
        types.map(x => `<option value="${esc(x.id)}" ${x.id === keepType ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    }
    await fill(account ? account.broker_id : '', account ? account.account_type_id : '');
    m.body.querySelector('#a-master').onclick = async () => {
      const kb = m.body.querySelector('#a-broker').value, kt = m.body.querySelector('#a-type').value;
      await masterEditor();
      fill(kb, kt);
    };
  }

  // ---------------- 증권 마스터 수정 (증권사 · 계좌종류 신규/수정/삭제) ----------------
  function masterEditor() {
    return new Promise(resolve => {
      const m = App.modal({ title: '증권 마스터 수정', size: 'mid', body: '', onClose: resolve, buttons: [{ label: '닫기', kind: 'primary' }] });
      const KINDS = [['broker', '증권사'], ['accountType', '계좌종류']];
      async function draw() {
        const [brokers, types, accounts] = await Promise.all([DataService.getBrokers(), DataService.getAccountTypes(), DataService.getAccounts()]);
        const lists = { broker: brokers, accountType: types };
        const usedBy = (kind, id) => accounts.filter(a => (kind === 'broker' ? a.broker_id : a.account_type_id) === id).length;
        m.body.innerHTML = `
          <p class="small muted" style="margin-top:0">계좌의 증권사·계좌종류는 여기 등록된 이름 중에서 고릅니다. 이름을 고치면 그 값을 쓰는 모든 계좌에 바로 반영되고, 쓰고 있는 계좌가 있는 항목은 삭제할 수 없습니다.</p>
          <div class="grid-2e">${KINDS.map(([kind, label]) => `
            <div class="master-col">
              <h3 class="sec-sub">${label} <span class="muted small">${lists[kind].length}개</span></h3>
              <ul class="comp-list">${lists[kind].map(x => `
                <li data-kind="${kind}" data-id="${esc(x.id)}">
                  <span class="m-name">${esc(x.name)} ${usedBy(kind, x.id) ? `<span class="muted small">· ${usedBy(kind, x.id)}개 계좌</span>` : ''}</span>
                  <span><button type="button" class="btn btn-sm" data-m-edit>수정</button><button type="button" class="btn btn-sm btn-ghost-danger" data-m-del>삭제</button></span>
                </li>`).join('')}
              </ul>
              <div class="toolbar" style="margin-top:8px"><input type="text" data-new="${kind}" placeholder="새 ${label} 이름" style="flex:1;width:auto"><button type="button" class="btn btn-primary btn-sm" data-add="${kind}">추가</button></div>
            </div>`).join('')}
          </div>
          <div class="notice" id="m-err" hidden></div>`;
        const showErr = msg => { const el = m.body.querySelector('#m-err'); el.hidden = !msg; el.textContent = msg || ''; };
        m.body.querySelectorAll('[data-add]').forEach(btn => {
          const input = m.body.querySelector(`[data-new="${btn.dataset.add}"]`);
          const add = async () => {
            try { await DataService.addMaster(btn.dataset.add, input.value); App.toast(`'${input.value.trim()}' 추가`); draw(); }
            catch (e) { showErr(e.message); }
          };
          btn.onclick = add;
          input.onkeydown = e => { if (e.key === 'Enter') add(); };
        });
        m.body.querySelectorAll('li[data-kind]').forEach(li => {
          const { kind, id } = li.dataset;
          const item = lists[kind].find(x => x.id === id);
          li.querySelector('[data-m-edit]').onclick = () => {
            li.innerHTML = `<input type="text" value="${esc(item.name)}" style="flex:1"><span><button type="button" class="btn btn-sm btn-primary" data-ok>저장</button><button type="button" class="btn btn-sm" data-cancel>취소</button></span>`;
            const input = li.querySelector('input');
            input.focus(); input.select();
            const save = async () => {
              try { await DataService.updateMaster(kind, id, input.value); App.toast('이름을 수정했습니다. 이 값을 쓰는 계좌에 모두 반영됩니다.'); draw(); }
              catch (e) { showErr(e.message); }
            };
            li.querySelector('[data-ok]').onclick = save;
            li.querySelector('[data-cancel]').onclick = () => draw();
            input.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); draw(); } };
          };
          li.querySelector('[data-m-del]').onclick = async () => {
            if (!(await App.confirm(`<b>${esc(item.name)}</b>을(를) 증권 마스터에서 삭제할까요?`, { okLabel: '삭제', danger: true }))) return;
            try { await DataService.deleteMaster(kind, id); App.toast(`'${item.name}' 삭제`); draw(); }
            catch (e) { showErr(e.message); }
          };
        });
      }
      draw();
    });
  }

  // ---------------- 보유 추가 ----------------
  async function addHoldingFlow(account) {
    const pick = await UI.pickInstrument({ title: `${account.name} — 종목 추가`, confirmLabel: '다음', allowNew: true, note: '등록된 종목과 전체 상장 종목 목록에서 이름/심볼/영문명으로 검색해 한 종목을 선택하세요.' });
    if (!pick) return;
    const inst = pick.__new ? await newInstrumentForm() : pick;
    if (!inst) return;
    const holdings = await DataService.getHoldings();
    const dup = holdings.find(h => h.account_id === account.id && h.instrument_id === inst.id);
    if (dup) {
      const ok = await App.confirm(`<b>${esc(inst.name)}</b>은(는) 이미 이 계좌에 있습니다.<br><small>같은 계좌에 같은 종목은 1행만 허용됩니다. 기존 보유를 수정하시겠습니까?</small>`, { okLabel: '기존 행 수정' });
      if (ok) holdingForm({ account, inst, holding: dup });
      return;
    }
    holdingForm({ account, inst });
  }

  // ---------------- 보유 추가/수정 폼 ----------------
  async function holdingForm({ account, inst, holding }) {
    const fx = (await DataService.getFxRate()).rate;
    const isUSD = inst.currency === 'USD', isCash = inst.asset_type === 'CASH';
    const unit = isUSD ? '$' : '₩';
    const qtyUnit = isCash ? unit : inst.asset_type === 'CRYPTO' ? inst.symbol : inst.asset_type === 'GOLD' ? 'g' : '주';
    const v = holding || { quantity: '', avg_price: '', avg_fx_rate: fx };
    const pm = isCash ? null : (await DataService.getPriceMeta())[inst.id];
    const manual = isCash ? null : await DataService.getManualPrice(inst.id);
    const SRCN = { GOOGLE: 'Google Finance', NAVER: '네이버 금융', UPBIT: '업비트', GOLD: '국제 금시세 환산', MANUAL: '직접 입력', MOCK: '예시 가격' };
    const hasMarket = pm && !['MANUAL', 'MOCK'].includes(pm.source);
    const m = App.modal({
      title: holding ? '보유 수정' : '보유 추가',
      body: `<div class="form">
        <div class="row2">
          <div class="field"><label>계좌</label><div class="ro">${esc(account.name)} <span class="muted small">${esc(account.broker)}</span></div></div>
          <div class="field"><label>자산군 (읽기 전용)</label><div class="ro">${UI.groupBadge(Groups.of(inst), !inst.asset_group, { link: false })}</div></div>
        </div>
        <div class="field"><label>종목</label><div class="ro"><b>${esc(inst.name)}</b> <span class="muted small">${esc(inst.symbol)} · ${esc(inst.exchange)} · ${esc(inst.asset_type)} · ${esc(inst.currency)}</span></div></div>
        <div class="field"><label>${isCash ? '금액 (예수금)' : '수량'}</label>
          <div class="input-unit"><input type="number" id="h-q" step="any" min="0" value="${v.quantity}"><span>${esc(qtyUnit)}</span></div></div>
        ${isCash ? '<div class="small muted">현금은 수량(금액)만 입력합니다. 평균매입가는 1로 고정됩니다.</div>' : `
        <div class="field"><label>평균매입가 (${inst.currency})</label>
          <div class="input-unit"><span>${unit}</span><input type="number" id="h-ap" step="any" min="0" value="${v.avg_price}"></div>
          <div class="hint">추가 매수 시 증권사에 표시된 평균단가를 그대로 입력하세요.</div></div>`}
        ${isUSD ? `<div class="field"><label>매입 평균환율 (USD/KRW)</label>
          <div class="input-unit"><span>₩</span><input type="number" id="h-fx" step="any" min="0" value="${v.avg_fx_rate}"></div>
          <div class="hint">${holding ? '증권사에 표시된 평균환율을 입력하세요.' : `기본값은 현재 환율 ${Fmt.fx(fx)}입니다.`}</div></div>` : ''}
        ${isCash ? '' : `<div class="field"><label>현재가</label>
          <div class="ro"><span id="mp-cur">${pm ? `<b>${Fmt.price(pm.price, inst.currency)}</b> <span class="muted small">${SRCN[pm.source] || pm.source} · ${Fmt.mdhm(pm.as_of)}</span>` : '<span class="muted">시세 없음 — 평균매입가로 평가</span>'}</span>
            <button type="button" class="btn btn-sm" id="mp-toggle" style="margin-left:8px">현재가 직접 입력</button></div>
          <div id="mp-box" class="toolbar" style="margin-top:6px" hidden>
            <div class="input-unit" style="width:200px"><span>${unit}</span><input type="number" id="mp-val" step="any" min="0" value="${manual ? manual.price : ''}" placeholder="현재가"></div>
            <button type="button" class="btn btn-sm btn-primary" id="mp-save">현재가 저장</button>
            ${manual ? '<button type="button" class="btn btn-sm btn-ghost-danger" id="mp-del">직접 입력 지우기</button>' : ''}</div>
          <div class="hint">${hasMarket ? '이 종목은 실제 시세가 있어 직접 입력한 값보다 시세가 우선합니다.' : '직접 입력한 현재가는 시세가 없는 종목(예: 잡주)의 평가금액·손익 계산에 쓰입니다. 같은 종목을 가진 모든 계좌에 적용됩니다.'}</div></div>`}
        <div class="small muted">자산군은 계좌/자산관리 › 자산 구성 관리에서 변경합니다.</div>
        <div class="notice" id="h-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          const q = api.body.querySelector('#h-q').value;
          const data = {
            account_id: account.id, instrument_id: inst.id, quantity: q === '' ? NaN : q,
            avg_price: isCash ? 1 : api.body.querySelector('#h-ap').value,
            avg_fx_rate: isUSD ? api.body.querySelector('#h-fx').value : 1
          };
          try {
            holding ? await DataService.updateHolding(holding.id, data) : await DataService.addHolding(data);
            api.close();
            App.toast(`${inst.name} 보유를 ${holding ? '수정' : '추가'}했습니다. 다음 08:00 스냅샷에 저장됩니다.`);
          } catch (e) { const el = api.body.querySelector('#h-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
    // [현재가 직접 입력]: 입력 칸을 열고, 저장하면 바로 평가금액·손익에 반영
    const tg = m.body.querySelector('#mp-toggle');
    if (tg) {
      const box = m.body.querySelector('#mp-box');
      const err = m.body.querySelector('#h-err');
      tg.onclick = () => { box.hidden = !box.hidden; if (!box.hidden) m.body.querySelector('#mp-val').focus(); };
      m.body.querySelector('#mp-save').onclick = async () => {
        try {
          await DataService.setManualPrice(inst.id, m.body.querySelector('#mp-val').value);
          App.toast(`${inst.name} 현재가를 직접 입력했습니다.`);
          box.hidden = true;
          const saved = await DataService.getManualPrice(inst.id);
          if (!hasMarket && saved) m.body.querySelector('#mp-cur').innerHTML = `<b>${Fmt.price(saved.price, inst.currency)}</b> <span class="muted small">직접 입력 · ${Fmt.mdhm(saved.as_of)}</span>`;
          tg.textContent = '현재가 직접 입력 (저장됨)';
        } catch (e) { err.hidden = false; err.textContent = e.message; }
      };
      const del = m.body.querySelector('#mp-del');
      if (del) del.onclick = async () => {
        await DataService.setManualPrice(inst.id, null);
        App.toast(`${inst.name}의 직접 입력 현재가를 지웠습니다.`);
        box.hidden = true;
      };
    }
  }

  // ---------------- 새 종목 등록 (자산군 선택 가능, 미선택 시 NULL) ----------------
  // presetGroup: 자산 구성 관리에서 부를 때 그 자산군을 미리 선택
  function newInstrumentForm(presetGroup) {
    return new Promise(resolve => {
      let done = false;
      App.modal({
        title: '새 종목 등록', size: 'mid',
        onClose: () => { if (!done) resolve(null); },
        body: `<div class="form">
          <div class="row2">
            <div class="field"><label>종목명</label><input type="text" id="n-name" placeholder="예: 엔비디아"></div>
            <div class="field"><label>영문명 (검색용, 선택)</label><input type="text" id="n-eng" placeholder="예: NVIDIA"></div>
          </div>
          <div class="row2">
            <div class="field"><label>심볼</label><input type="text" id="n-symbol" placeholder="예: NVDA, 005930"></div>
            <div class="field"><label>거래소</label><input type="text" id="n-ex" list="n-ex-list" placeholder="예: NASDAQ">
              <datalist id="n-ex-list">${APP_CONFIG.EXCHANGES.map(x => `<option value="${x}">`).join('')}</datalist></div>
          </div>
          <div class="row2">
            <div class="field"><label>자산유형</label><select id="n-type">${APP_CONFIG.ASSET_TYPES.map(x => `<option>${x}</option>`).join('')}</select></div>
            <div class="field"><label>거래 통화</label><select id="n-cur">${APP_CONFIG.CURRENCIES.map(x => `<option>${x}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>자산군</label>
            <select id="n-group"><option value="">선택 안 함 (미지정 → 기타종목으로 집계)</option>${Groups.list.map(g => `<option value="${g.code}"${g.code === presetGroup ? ' selected' : ''}>${g.name}</option>`).join('')}</select></div>
          <div class="small muted">Mock 단계에서는 새 종목의 현재가가 없어 평균매입가로 평가합니다.</div>
          <div class="notice" id="n-err" hidden></div></div>`,
        buttons: [{ label: '취소' }, {
          label: '등록 후 계속', kind: 'primary', onClick: async api => {
            const b = api.body;
            const data = {
              name: b.querySelector('#n-name').value, eng_name: b.querySelector('#n-eng').value,
              symbol: b.querySelector('#n-symbol').value, exchange: b.querySelector('#n-ex').value,
              asset_type: b.querySelector('#n-type').value, currency: b.querySelector('#n-cur').value,
              asset_group: b.querySelector('#n-group').value || null
            };
            try {
              const inst = await DataService.addInstrument(data);
              done = true; api.close(); resolve(inst);
            } catch (e) {
              if (e.code === 'DUPLICATE' && await App.confirm(`${esc(e.message)}<br><small>이 종목으로 계속할까요?</small>`, { okLabel: '이 종목 사용' })) {
                done = true; api.close(); resolve(e.instrument); return;
              }
              const el = b.querySelector('#n-err'); el.hidden = false; el.textContent = e.message;
            }
          }
        }]
      });
    });
  }

  // ---------------- XLSX 업로드 (12-5항) ----------------
  function uploadFlow() {
    let validated = null;
    const m = App.modal({ title: 'XLSX 업로드', size: 'wide', body: '' });
    const steps = (n) => `<div class="steps">${['파일 선택', '유효성 점검', '업로드 현황 확인', '반영'].map((s, i) => `<span class="${i === n ? 'on' : i < n ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`;

    function stepFile() {
      validated = null;
      m.body.innerHTML = `${steps(0)}
        <div class="notice">업로드한 파일은 <b>업로드 시점의 내 전체 계좌·자산 현황</b>으로 간주됩니다. [반영]하면 현재 계좌·보유가 파일 내용으로 <b>전부 교체</b>되며, [반영]을 누르기 전에는 아무 데이터도 바뀌지 않습니다.</div>
        <label class="drop" id="drop">
          <div style="font-size:15px;font-weight:600;margin-bottom:6px">여기에 .xlsx 파일을 끌어다 놓거나 클릭해 선택하세요</div>
          <div class="small muted">최대 5MB · 시트: 기준정보 / 보유 / 작성안내 · 파일은 서버로 전송되지 않고 브라우저에서만 읽습니다</div>
          <input type="file" id="file" accept=".xlsx" hidden>
        </label>
        <div class="small muted" style="margin-top:10px">계좌 관리의 [엑셀 다운로드] 파일을 고쳐서 올리면 됩니다. 테스트는 [테스트용 샘플 파일 받기] 파일로 해 보세요.</div>`;
      m.setButtons([{ label: '취소' }]);
      const drop = m.body.querySelector('#drop'), input = m.body.querySelector('#file');
      input.onchange = () => input.files[0] && check(input.files[0]);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && check(e.dataTransfer.files[0]); };
    }

    async function check(file) {
      m.body.innerHTML = `${steps(1)}<div class="muted">점검 중…</div>`;
      const parsed = await DataService.parseHoldingsXlsx(file);
      validated = await DataService.validateImport(parsed);
      const { errors, warnings } = validated;
      const issueRows = [...errors.map(e => ['오류', e]), ...warnings.map(e => ['경고', e])]
        .map(([k, e]) => `<tr><td class="${k === '오류' ? 'err' : 'wrn'}">${k}</td><td class="num">${esc(e.row)}</td><td>${esc(e.col)}</td><td class="val-in">${esc(e.value)}</td><td class="val-db" style="white-space:normal">${esc(e.expected || '')}</td><td style="white-space:normal">${esc(e.reason)}</td></tr>`).join('');
      const issues = issueRows ? `
        <div class="sec-hd"><h2 style="font-size:15px">점검 결과 — 오류 ${errors.length}건 · 경고 ${warnings.length}건</h2>
          <button type="button" class="btn btn-sm" id="dl-issues">점검 결과 xlsx 다운로드</button></div>
        <div class="tbl-wrap scroll-y issue-tbl"><table class="tbl"><thead><tr><th>구분</th><th class="num">행 번호</th><th>컬럼</th><th>입력값</th><th>DB 값</th><th>사유</th></tr></thead><tbody>${issueRows}</tbody></table></div>`
        : '<div class="notice info">오류와 경고가 없습니다.</div>';

      if (errors.length) {
        m.body.innerHTML = `${steps(1)}<div class="small muted">파일: ${esc(validated.fileName)}${validated.baseDate ? ` · 기준일자 ${validated.baseDate}` : ''}</div>
          <div class="notice" style="border-color:#f1b0b0;background:#fdeeee;color:#8a1f1f">DB 정보와 다른 값 등 오류가 <b>${errors.length}건</b> 있어 <b>반영하지 않았습니다</b> (데이터는 그대로입니다). 아래 표의 <b>입력값</b>과 <b>DB 값</b>을 비교해 파일을 고친 뒤 다시 올려 주세요.</div>${issues}`;
        bindIssues();
        m.setButtons([{ label: '다른 파일 선택', onClick: () => stepFile() }, { label: '취소' }, { label: '반영', kind: 'primary', disabled: true }]);
        return;
      }
      showPreview(issues);
    }

    // 3단계: 반영하면 바뀔 현황 미리보기 (+ 파일 속 종목의 자산군 지정)
    async function showPreview(issues) {
      const { warnings } = validated;
      const pv = await DataService.previewImport(validated);
      const mode = App.mode;
      const nNew = pv.fileInsts.filter(i => i.isNew).length, nUn = pv.fileInsts.filter(i => !i.group).length;
      m.body.innerHTML = `${steps(2)}
        <div class="status-chips"><span class="chip">파일 <b>${esc(validated.fileName)}</b></span><span class="chip">기준일자 <b>${validated.baseDate}</b></span>
          <span class="chip">계좌 <b>${pv.accounts.length}</b>개 · 보유 <b>${pv.holdings.length}</b>건</span><span class="chip">적용 환율 <b>${Fmt.fx(pv.fx)}</b> (반영 시점)</span></div>
        <div class="notice ${nUn ? '' : 'info'} map-bar"><span>파일의 종목 <b>${pv.fileInsts.length}</b>개 · 새 종목 <b>${nNew}</b>개 · 자산군 미지정 <b class="${nUn ? 'warn-text' : ''}">${nUn}</b>개${nUn ? ' — 미지정 종목은 기타종목으로 집계됩니다' : ''}</span>
          <button type="button" class="btn btn-sm btn-primary" id="btn-map">자산군 지정</button></div>
        ${issues}
        <h3 class="sec-sub">업로드 현황 확인 — 반영하면 아래와 같이 바뀝니다</h3>
        ${UI.totalsCards(pv.model.total, mode, pv.fx)}
        <h3 class="sec-sub">자산군별 금액·비중</h3>${UI.groupTable(pv.model, mode, { link: false })}
        <h3 class="sec-sub">계좌 → 보유 종목</h3>${UI.holdingsTree(pv.model, mode, { editable: false, linkGroups: false, byBroker: true })}`;
      bindIssues();
      m.body.querySelector('#btn-map').onclick = () => groupMapForm(pv.fileInsts, issues);
      m.setButtons([
        { label: '다른 파일 선택', onClick: () => stepFile() },
        { label: '취소' },
        { label: '반영', kind: 'primary', id: 'btn-apply', disabled: warnings.length > 0, onClick: apply }
      ]);
      // 경고가 있으면 [반영] 바로 옆(아래 버튼줄)의 확인 체크 후 반영 가능 — 스크롤하지 않아도 보이게
      if (warnings.length) {
        const lab = document.createElement('label');
        lab.className = 'check ack-check';
        lab.innerHTML = `<input type="checkbox" id="ack"> 경고 <b>${warnings.length}</b>건을 확인했습니다 <span class="muted small">(체크하면 [반영]이 켜집니다)</span>`;
        m.footer.prepend(lab);
        lab.querySelector('#ack').onchange = e => { m.footer.querySelector('#btn-apply').disabled = !e.target.checked; };
      }
    }

    // 자산군 지정 팝업: 파일 속 종목마다 자산군 선택 → 미리보기에 바로 반영, [반영]할 때 종목 마스터에 저장
    function groupMapForm(insts, issues) {
      const opts = sel => `<option value="">미지정 (기타종목으로 집계)</option>${Groups.list.map(g => `<option value="${g.code}" ${sel === g.code ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}`;
      const list = insts.slice().sort((a, b) => (!!a.group - !!b.group) || (b.isNew - a.isNew) || a.name.localeCompare(b.name, 'ko'));
      App.modal({
        title: '자산군 지정', size: 'mid',
        body: `<p class="small muted" style="margin-top:0">업로드 파일에 있는 종목의 자산군을 고르세요. 미리보기에 바로 반영되고, <b>[반영]</b>을 눌러야 저장됩니다. 이미 등록된 종목의 자산군을 바꾸면 그 종목을 가진 모든 계좌에 적용됩니다.</p>
          <div class="toolbar" style="margin-bottom:8px"><label class="small muted">미지정 종목 한꺼번에</label><select id="gm-all" class="inline"><option value="">선택…</option>${Groups.list.map(g => `<option value="${g.code}">${esc(g.name)}</option>`).join('')}</select></div>
          <div class="tbl-wrap scroll-y" style="max-height:55vh"><table class="tbl">
            <thead><tr><th>종목명</th><th>심볼</th><th>거래 통화</th><th class="num">보유</th><th>자산군</th></tr></thead>
            <tbody>${list.map(i => `<tr>
              <td class="nm">${esc(i.name)} ${i.isNew ? '<span class="tag" title="반영하면 종목 마스터에 새로 등록됩니다">새 종목</span>' : ''}</td>
              <td class="sym">${esc(i.symbol)}<small>${esc(i.exchange)}</small></td><td>${esc(i.currency)}</td>
              <td class="num">${i.holdCount}건</td>
              <td><select class="inline" data-gm="${esc(i.key)}" data-was="${esc(i.group || '')}">${opts(i.group)}</select>${!i.isNew && i.oldGroup !== i.group ? ` <span class="small warn-text" title="현재 자산군">현재: ${esc(i.oldGroup ? Groups.name(i.oldGroup) : '미지정')}</span>` : ''}</td>
            </tr>`).join('')}</tbody>
          </table></div>`,
        buttons: [{ label: '취소' }, {
          label: '적용', kind: 'primary', onClick: async api => {
            const map = { ...(validated.groupMap || {}) };
            api.body.querySelectorAll('[data-gm]').forEach(s => { if (s.value !== s.dataset.was) map[s.dataset.gm] = s.value || null; });
            validated.groupMap = map;
            api.close();
            await showPreview(issues);
            App.toast('자산군 지정을 미리보기에 반영했습니다. [반영]을 눌러야 저장됩니다.');
          }
        }]
      });
      const body = document.querySelector('.modal-backdrop:last-child .modal-bd');
      body.querySelector('#gm-all').onchange = e => {
        if (!e.target.value) return;
        body.querySelectorAll('[data-gm]').forEach(s => { if (!s.value) s.value = e.target.value; });
        e.target.value = '';
      };
    }

    function bindIssues() {
      const b = m.body.querySelector('#dl-issues');
      if (b) b.onclick = () => DataService.downloadIssuesXlsx(validated.errors, validated.warnings);
    }

    async function apply() {
      const ok = await App.confirm('업로드한 파일이 현재 계좌·자산 현황으로 대체됩니다. 과거 이력은 변경되지 않으며, 다음 08:00 스냅샷부터 저장됩니다.', { okLabel: '반영', title: '반영 확인' });
      if (!ok) return;
      try {
        const r = await DataService.replaceCurrentHoldings(validated);
        m.close();
        App.alert(`계좌 ${r.accountCount}개, 보유 종목 ${r.holdingCount}건으로 현재 현황이 반영되었습니다.<br><small>잘못 올렸다면 [직전 상태로 되돌리기]로 복원할 수 있습니다 (다음 스냅샷 전까지).</small>`, '반영 완료');
      } catch (e) { App.alert('반영하지 못했습니다: ' + esc(e.message)); }
    }

    stepFile();
  }

  App.init('manage', render);
})();
