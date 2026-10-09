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
    if (tab === 'composition') content = compositionTab(instruments, heldCount, await DataService.getCatalogInfo());
    else if (tab === 'accounts') content = accountsTab(model, mode);
    else content = uploadTab(status);

    main.innerHTML = `
      <div class="page-hd">
        <div><h1>계좌/자산관리</h1><p class="desc">자산군에 속하는 종목과 계좌별 보유 내역을 관리합니다. 저장하면 모든 화면에 바로 반영되고, 이력에는 다음 08:00 스냅샷에 저장됩니다.</p></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec">
        <div class="sec-hd"><h2>자산군별 종목 매핑</h2><span class="small muted">진한 글씨 = 보유 중 · 흐린 글씨 = 매핑만 되어 있고 보유 없음</span></div>
        ${mappingSummary(instruments, heldCount)}
      </div>
      <div class="sec">
        <div class="tabs sub-tabs">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${content}
      </div>`;

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
  function compositionTab(instruments, heldCount, cat) {
    const row = (i, assigned) => `<tr>
      <td class="nm">${esc(i.name)} <span class="muted small">${esc(i.eng_name || '')}</span></td>
      <td class="sym">${esc(i.symbol)}<small>${esc(i.exchange)}</small></td>
      <td>${esc(i.asset_type)}</td><td>${esc(i.currency)}</td>
      <td class="num">${heldCount[i.id] ? `${heldCount[i.id]}개 계좌` : '<span class="muted">보유 없음</span>'}</td>
      <td class="actions">${assigned
        ? `<button type="button" class="btn btn-sm btn-ghost-danger" data-remove="${esc(i.id)}">제거</button>`
        : `<select class="inline" data-assign="${esc(i.id)}"><option value="">자산군 지정…</option>${Groups.list.map(g => `<option value="${g.code}">${g.name}</option>`).join('')}</select>`}</td>
    </tr>`;
    const blocks = Groups.list.map(g => {
      const list = instruments.filter(i => i.asset_group === g.code);
      return `<tbody>
        <tr class="g-row" id="comp-${g.code}"><td colspan="5"><span class="dot" style="background:${g.color}"></span>${g.name} <span class="muted small">${list.length}종목</span></td>
          <td class="actions"><button type="button" class="btn btn-sm btn-primary" data-add-to="${g.code}">+ 종목 추가</button></td></tr>
        ${list.map(i => row(i, true)).join('') || '<tr><td colspan="6" class="muted">아직 종목이 없습니다</td></tr>'}
      </tbody>`;
    }).join('');
    const un = instruments.filter(i => !i.asset_group);
    return `
      <div class="card pad catalog-bar">
        <div><b>외부 종목 목록</b> <span class="muted">${cat.count}개 종목 · 마지막 갱신 ${Fmt.mdhm(cat.syncedAt)} · 다음 자동 갱신 ${Fmt.mdhm(cat.nextSyncAt)}</span>
          <div class="small muted">상장 종목 목록을 한 달에 한 번 외부에서 받아 DB에 저장해 두고, [종목 추가] 검색은 이 저장된 목록을 조회합니다. (DB 용량 절약)</div></div>
        <button type="button" class="btn" id="btn-sync" title="외부 종목 목록을 지금 다시 받아오고, 등록된 종목의 이름도 새 이름으로 바꿉니다">↻ 목록 최신화</button>
      </div>
      <p class="small muted">종목을 자산군에 <b>추가</b>하거나 <b>제거</b>해도 종목과 보유 내역은 지워지지 않고 자산군 분류만 바뀝니다. 한 종목을 옮기면 그 종목을 가진 모든 계좌의 보유분이 함께 옮겨집니다.</p>
      <div class="tbl-wrap"><table class="tbl comp-tbl">
        <thead><tr><th>종목명</th><th>심볼</th><th>자산유형</th><th>통화</th><th class="num">보유</th><th>관리</th></tr></thead>
        ${blocks}
        <tbody>
          <tr class="g-row"><td colspan="6">미지정 <span class="muted small">${un.length}종목 · 자산군을 지정하지 않아 기타종목으로 집계됩니다</span></td></tr>
          ${un.map(i => row(i, false)).join('') || '<tr><td colspan="6" class="muted">없음</td></tr>'}
        </tbody>
      </table></div>`;
  }

  function bindComposition(main, instruments) {
    main.querySelector('#btn-sync').onclick = async () => {
      const r = await DataService.syncCatalog();
      App.toast(r.renamed.length ? `목록을 최신화했습니다. 종목명 변경 ${r.renamed.length}건: ${r.renamed.map(x => `${x.from} → ${x.to}`).join(', ')}` : '목록을 최신화했습니다. 바뀐 종목명은 없습니다.');
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
    main.querySelectorAll('[data-add-to]').forEach(b => b.onclick = () => addToGroup(b.dataset.addTo));
  }

  async function addToGroup(code) {
    const pick = await UI.pickInstrument({ title: `${Groups.name(code)}에 종목 추가`, confirmLabel: '추가', allowNew: true, note: '등록된 종목과 외부 종목 목록(현금·RP 포함)에서 검색합니다.' });
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
          <li>엑셀에서 수량·평균매입가 등을 고치거나 줄을 추가·삭제합니다. (양식은 그대로)</li>
          <li>아래 <b>[XLSX 업로드]</b>로 올리고, 점검 결과와 미리보기를 확인한 뒤 <b>[반영]</b>합니다.</li>
        </ol>
        <div class="notice">업로드한 파일 = <b>현재 최종 계좌 현황</b>입니다. 추가·삭제를 골라서 하는 것이 아니라, 파일 내용으로 계좌·보유 전체가 바뀝니다. 파일에 없는 계좌·종목은 현재 현황에서 빠집니다. (과거 이력은 바뀌지 않습니다)</div>
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
  function accountForm(account) {
    const m = App.modal({
      title: account ? '계좌 수정' : '계좌 추가',
      body: `<div class="form">
        <div class="field"><label>계좌명</label><input type="text" id="a-name" value="${esc(account ? account.name : '')}" placeholder="예: 키움 일반"></div>
        <div class="field"><label>증권사</label><input type="text" id="a-broker" value="${esc(account ? account.broker : '')}" placeholder="예: 키움증권"></div>
        <div class="notice" id="a-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '저장', kind: 'primary', onClick: async api => {
          const data = { name: api.body.querySelector('#a-name').value, broker: api.body.querySelector('#a-broker').value };
          try {
            account ? await DataService.updateAccount(account.id, data) : await DataService.addAccount(data);
            api.close(); App.toast(account ? '계좌를 수정했습니다.' : '계좌를 추가했습니다.');
          } catch (e) { const el = api.body.querySelector('#a-err'); el.hidden = false; el.textContent = e.message; }
        }
      }]
    });
  }

  // ---------------- 보유 추가 ----------------
  async function addHoldingFlow(account) {
    const pick = await UI.pickInstrument({ title: `${account.name} — 종목 추가`, confirmLabel: '다음', allowNew: true, note: '등록된 종목과 외부 종목 목록에서 이름/심볼/영문명으로 검색해 한 종목을 선택하세요.' });
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
        <div class="small muted">자산군은 자산군 현황 화면의 [구성]에서만 변경합니다.</div>
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
            <div class="field"><label>통화</label><select id="n-cur">${APP_CONFIG.CURRENCIES.map(x => `<option>${x}</option>`).join('')}</select></div>
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
        .map(([k, e]) => `<tr><td class="${k === '오류' ? 'err' : 'wrn'}">${k}</td><td class="num">${esc(e.row)}</td><td>${esc(e.col)}</td><td>${esc(e.value)}</td><td style="white-space:normal">${esc(e.reason)}</td></tr>`).join('');
      const issues = issueRows ? `
        <div class="sec-hd"><h2 style="font-size:15px">점검 결과 — 오류 ${errors.length}건 · 경고 ${warnings.length}건</h2>
          <button type="button" class="btn btn-sm" id="dl-issues">점검 결과 xlsx 다운로드</button></div>
        <div class="tbl-wrap scroll-y issue-tbl"><table class="tbl"><thead><tr><th>구분</th><th class="num">행 번호</th><th>컬럼</th><th>입력값</th><th>사유</th></tr></thead><tbody>${issueRows}</tbody></table></div>`
        : '<div class="notice info">오류와 경고가 없습니다.</div>';

      if (errors.length) {
        m.body.innerHTML = `${steps(1)}<div class="small muted">파일: ${esc(validated.fileName)}${validated.baseDate ? ` · 기준일자 ${validated.baseDate}` : ''}</div>
          <div class="notice" style="border-color:#f1b0b0;background:#fdeeee;color:#8a1f1f">오류가 ${errors.length}건 있어 반영할 수 없습니다. 파일을 고친 뒤 다시 올려 주세요. (데이터는 변경되지 않았습니다)</div>${issues}`;
        bindIssues();
        m.setButtons([{ label: '다른 파일 선택', onClick: () => stepFile() }, { label: '취소' }, { label: '반영', kind: 'primary', disabled: true }]);
        return;
      }
      const pv = await DataService.previewImport(validated);
      const mode = App.mode;
      m.body.innerHTML = `${steps(2)}
        <div class="status-chips"><span class="chip">파일 <b>${esc(validated.fileName)}</b></span><span class="chip">기준일자 <b>${validated.baseDate}</b></span>
          <span class="chip">계좌 <b>${pv.accounts.length}</b>개 · 보유 <b>${pv.holdings.length}</b>건</span><span class="chip">적용 환율 <b>${Fmt.fx(pv.fx)}</b> (반영 시점)</span></div>
        ${issues}
        <h3 class="sec-sub">업로드 현황 확인 — 반영하면 아래와 같이 바뀝니다</h3>
        ${UI.totalsCards(pv.model.total, mode, pv.fx)}
        <h3 class="sec-sub">자산군별 금액·비중</h3>${UI.groupTable(pv.model, mode, { link: false })}
        <h3 class="sec-sub">계좌 → 보유 종목</h3>${UI.holdingsTree(pv.model, mode, { editable: false, linkGroups: false, byBroker: true })}
        ${warnings.length ? `<label class="check" style="margin-top:12px"><input type="checkbox" id="ack"> 경고 ${warnings.length}건을 확인했습니다</label>` : ''}`;
      bindIssues();
      m.setButtons([
        { label: '다른 파일 선택', onClick: () => stepFile() },
        { label: '취소' },
        { label: '반영', kind: 'primary', id: 'btn-apply', disabled: warnings.length > 0, onClick: apply }
      ]);
      const ack = m.body.querySelector('#ack');
      if (ack) ack.onchange = () => { m.footer.querySelector('#btn-apply').disabled = !ack.checked; };
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
