// 계좌 관리 (accounts.html) — 계좌 → 보유 종목 트리, 계좌·보유 추가/수정/삭제, XLSX 업로드 (12항)
(function () {
  const collapsed = new Set();
  let filterGroup = 'ALL';
  let sortBy = 'default';
  let pendingHash = decodeURIComponent(location.hash.slice(1));

  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const mode = App.mode;
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-hd">
        <div><h1>계좌 관리</h1><p class="desc">계좌별 보유 종목을 조회하고 수정합니다. 저장하면 Dashboard·자산군 현황에 즉시 반영되고, 이력에는 다음 08:00 스냅샷에 저장됩니다.</p></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec card pad">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" id="btn-add-acc">+ 계좌 추가</button>
          <span class="spacer"></span>
          <button type="button" class="btn" id="btn-upload">XLSX 업로드</button>
          <button type="button" class="btn" id="btn-sample">샘플 데이터 다운로드</button>
          <button type="button" class="btn" id="btn-template">양식 다운로드</button>
          <button type="button" class="btn" id="btn-export">현재 보유 내보내기</button>
          ${status.canUndo ? '<button type="button" class="btn btn-ghost-danger" id="btn-undo" title="다음 스냅샷 전까지 가능">직전 상태로 되돌리기</button>' : ''}
        </div>
      </div>
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        <div class="sec-hd">
          <div class="toolbar">
            <label class="small muted" for="f-group">자산군 필터</label>
            <select id="f-group" class="inline">
              <option value="ALL">전체</option>
              ${Groups.list.map(g => `<option value="${g.code}" ${filterGroup === g.code ? 'selected' : ''}>${g.name}${g.code === 'OTHER_STOCK' ? ' (미지정 포함)' : ''}</option>`).join('')}
              <option value="UNASSIGNED" ${filterGroup === 'UNASSIGNED' ? 'selected' : ''}>미지정만</option>
            </select>
            <label class="small muted" for="f-sort">정렬</label>
            <select id="f-sort" class="inline">
              <option value="default" ${sortBy === 'default' ? 'selected' : ''}>등록순</option>
              <option value="group" ${sortBy === 'group' ? 'selected' : ''}>자산군순</option>
              <option value="group-desc" ${sortBy === 'group-desc' ? 'selected' : ''}>자산군 역순</option>
              <option value="value" ${sortBy === 'value' ? 'selected' : ''}>평가금액 큰 순</option>
            </select>
          </div>
          <div class="toolbar"><button type="button" class="btn btn-sm" id="exp-all">모두 펼치기</button><button type="button" class="btn btn-sm" id="col-all">모두 접기</button></div>
        </div>
        ${filterGroup !== 'ALL' ? '<div class="notice info">자산군 필터 적용 중입니다. 계좌 소계는 계좌 전체 기준입니다.</div>' : ''}
        ${UI.holdingsTree(model, mode, { editable: true, filterGroup, sortBy, collapsed })}
        <p class="small muted">자산군은 이 화면에서 읽기 전용입니다 (같은 종목을 가진 다른 계좌에도 영향이 가기 때문). 자산군을 클릭하면 자산군 현황의 해당 위치로 이동합니다.
          회색 <span class="gbadge unassigned">기타종목<small>미지정</small></span>은 자산군 미지정 종목입니다.</p>
      </div>`;

    main.querySelector('#btn-add-acc').onclick = () => accountForm();
    main.querySelector('#btn-upload').onclick = () => uploadFlow();
    main.querySelector('#btn-sample').onclick = () => DataService.downloadSampleXlsx(Fmt.todayKST());
    main.querySelector('#btn-template').onclick = () => DataService.downloadTemplateXlsx(Fmt.todayKST());
    main.querySelector('#btn-export').onclick = () => DataService.exportHoldingsXlsx();
    const undo = main.querySelector('#btn-undo');
    if (undo) undo.onclick = async () => {
      if (!(await App.confirm('XLSX 업로드 직전 상태로 되돌릴까요?', { okLabel: '되돌리기', danger: true }))) return;
      await DataService.undoLastImport();
      App.toast('업로드 직전 상태로 되돌렸습니다.');
    };
    main.querySelector('#f-group').onchange = e => { filterGroup = e.target.value; App.rerender(); };
    main.querySelector('#f-sort').onchange = e => { sortBy = e.target.value; App.rerender(); };
    main.querySelector('#exp-all').onclick = () => { collapsed.clear(); App.rerender(); };
    main.querySelector('#col-all').onclick = () => { model.accounts.forEach(a => collapsed.add(a.key)); App.rerender(); };
    const sg = main.querySelector('[data-sort-group]');
    if (sg) sg.onclick = () => { sortBy = sortBy === 'group' ? 'group-desc' : sortBy === 'group-desc' ? 'default' : 'group'; App.rerender(); };
    main.querySelectorAll('[data-toggle-acc]').forEach(b => b.onclick = () => {
      const k = b.dataset.toggleAcc; collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); App.rerender();
    });
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => onAction(b.dataset.act, b.dataset.id, model));

    if (pendingHash) {
      const row = main.querySelector(`[data-acc="${CSS.escape(pendingHash)}"]`);
      pendingHash = '';
      if (row) row.scrollIntoView({ block: 'center' });
    }
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
    const pick = await UI.pickInstrument({ title: `${account.name} — 종목 추가`, confirmLabel: '다음', allowNew: true, note: '종목 마스터에서 이름/심볼/영문명으로 검색해 한 종목을 선택하세요.' });
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
  function newInstrumentForm() {
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
            <select id="n-group"><option value="">선택 안 함 (미지정 → 기타종목으로 집계)</option>${Groups.list.map(g => `<option value="${g.code}">${g.name}</option>`).join('')}</select></div>
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
        <div class="small muted" style="margin-top:10px">처음이라면 [샘플 데이터 다운로드] 파일을 그대로 올려 보세요.</div>`;
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
        <h3 class="sec-sub">계좌 → 보유 종목</h3>${UI.holdingsTree(pv.model, mode, { editable: false })}
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

  App.init('accounts', render);
})();
