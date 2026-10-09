// 공통 UI: 상단 메뉴, 통화 모드, 모달, 토스트, 상태 표시줄
window.App = (function () {
  const MODES = [
    { code: 'KRW', label: '원화환산' },
    { code: 'USD', label: '달러환산' },
    { code: 'MIXED', label: '한국=원화 / 미국=달러' }
  ];
  const PAGES = [
    { key: 'dashboard', href: 'index.html', label: 'Dashboard' },
    { key: 'groups', href: 'groups.html', label: '자산군 현황' },
    { key: 'accounts', href: 'accounts.html', label: '계좌 현황' },
    { key: 'history', href: 'history.html', label: '이력' },
    { key: 'manage', href: 'manage.html', label: '계좌/자산관리' }
  ];
  // 배포 버전 확인: 브라우저가 예전 화면 파일을 기억하고 있으면 최신 버전으로 한 번 새로고침합니다.
  // (이 파일 주소의 ?v= 값과 서버의 version.txt 를 비교. 배포할 때마다 둘을 같이 올립니다)
  (function checkVersion() {
    const cur = (document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src) || [])[1];
    if (!cur || location.protocol === 'file:') return;
    fetch('version.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(v => {
      v = v.trim();
      const key = 'myAsset.reloadedFor';
      if (v && v !== cur && sessionStorage.getItem(key) !== v) {
        sessionStorage.setItem(key, v);
        location.reload();
      }
    }).catch(() => {});
  })();

  const app = { mode: 'KRW' }; // 기본값 원화환산, 선택 상태는 저장하지 않음 (13항)
  let renderFn = null;
  let rendering = false, pending = false;

  async function rerender() {
    if (!renderFn) return;
    if (rendering) { pending = true; return; }
    rendering = true;
    try { await renderFn(); }
    catch (e) { console.error(e); toast('화면을 그리는 중 오류가 발생했습니다: ' + e.message, 'error'); }
    rendering = false;
    if (pending) { pending = false; rerender(); }
  }

  function header(pageKey) {
    const el = document.getElementById('app-header');
    el.innerHTML = `
      <div class="hdr-inner">
        <a class="brand" href="index.html">my<b>Asset</b> <span class="badge-mock" title="실제 DB가 아닌 Mock(가상) 데이터로 동작합니다">Mock</span></a>
        <nav class="nav">${PAGES.map(p => `<a href="${p.href}" class="${p.key === pageKey ? 'active' : ''}">${p.label}</a>`).join('')}</nav>
        <div class="hdr-right">
          <span class="chip fx-chip" id="hdr-fx" title="적용 환율 (USD/KRW) — 손익 계산에 쓰는 현재 환율">$1 = <b>…</b></span>
          <div class="seg" role="group" aria-label="통화 표시">
            ${MODES.map(m => `<button type="button" data-mode="${m.code}" class="${m.code === app.mode ? 'on' : ''}">${m.label}</button>`).join('')}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-reset-mock" title="이 브라우저에 저장된 Mock 변경 내용을 지우고 처음 상태로 되돌립니다">Mock 초기화</button>
        </div>
      </div>`;
    DataService.getFxRate().then(fx => { el.querySelector('#hdr-fx b').textContent = Fmt.fx(fx.rate); });
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      app.mode = b.dataset.mode;
      el.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === app.mode));
      rerender();
    }));
    el.querySelector('#btn-reset-mock').addEventListener('click', async () => {
      if (await confirm('Mock 데이터를 처음 상태로 되돌릴까요?<br><small>계좌·보유·자산군 변경, XLSX 업로드, 시뮬레이션 스냅샷이 모두 초기화됩니다.</small>', { okLabel: '초기화', danger: true })) {
        await DataService.resetMock();
        toast('Mock 데이터를 초기화했습니다.');
      }
    });
  }

  function init(pageKey, fn) {
    renderFn = fn;
    header(pageKey);
    DataService.onChange(rerender); // 저장 즉시 화면 재계산 (19-1항)
    rerender();
    // 외부 종목 목록 정기(월 1회) 갱신 — 갱신 시각이 지났으면 자동 최신화 (새 종목명 반영)
    DataService.autoSyncCatalogIfDue().then(r => { if (r && r.renamed.length) toast(`종목 목록을 정기 갱신했습니다. 종목명 변경 ${r.renamed.length}건 반영`); }).catch(() => {});
  }

  // ---------------- 모달 ----------------
  function modal({ title, body, buttons = [], size = '', onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-hd"><h3>${title}</h3><button type="button" class="x" aria-label="닫기">×</button></div>
        <div class="modal-bd"></div>
        <div class="modal-ft"></div>
      </div>`;
    const bd = wrap.querySelector('.modal-bd');
    if (typeof body === 'string') bd.innerHTML = body; else if (body) bd.appendChild(body);
    const ft = wrap.querySelector('.modal-ft');
    const api = {
      el: wrap, body: bd, footer: ft,
      close() { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); },
      setButtons(list) {
        ft.innerHTML = '';
        list.forEach(b => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn ' + (b.kind ? 'btn-' + b.kind : '');
          btn.textContent = b.label;
          if (b.disabled) btn.disabled = true;
          if (b.id) btn.id = b.id;
          btn.addEventListener('click', () => b.onClick ? b.onClick(api, btn) : api.close());
          ft.appendChild(btn);
        });
        ft.style.display = list.length ? '' : 'none';
      }
    };
    const onKey = e => { if (e.key === 'Escape') api.close(); };
    document.addEventListener('keydown', onKey);
    wrap.querySelector('.x').addEventListener('click', () => api.close());
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) api.close(); });
    api.setButtons(buttons);
    document.body.appendChild(wrap);
    const first = bd.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return api;
  }
  function confirm(message, { title = '확인', okLabel = '확인', cancelLabel = '취소', danger = false } = {}) {
    return new Promise(resolve => {
      let done = false;
      const m = modal({
        title, body: `<div class="confirm-msg">${message}</div>`,
        onClose: () => { if (!done) resolve(false); },
        buttons: [
          { label: cancelLabel, onClick: api => api.close() },
          { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: api => { done = true; api.close(); resolve(true); } }
        ]
      });
      setTimeout(() => m.footer.querySelector('.btn-primary, .btn-danger').focus(), 30);
    });
  }
  function alert(message, title = '안내') {
    return new Promise(resolve => {
      modal({ title, body: `<div class="confirm-msg">${message}</div>`, onClose: resolve, buttons: [{ label: '확인', kind: 'primary', onClick: api => api.close() }] });
    });
  }
  function toast(msg, kind = '') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('hide'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  // ---------------- 상태 표시줄 (19-3항) ----------------
  function statusBar(st, { showBase = true, showSnapshot = true } = {}) {
    const parts = [];
    if (showBase) parts.push(`<span class="chip">현황 기준일 <b>${st.baseDate}</b> · ${esc(st.baseSource)}</span>`);
    if (showSnapshot && st.lastSnapshot) {
      parts.push(`<span class="chip">최근 스냅샷: <b>${Fmt.md(st.lastSnapshot.date)} ${st.lastSnapshot.time}</b>${st.lastSnapshot.simulated ? ' (시뮬레이션)' : ''} · 다음 스냅샷: <b>${Fmt.md(st.nextSnapshotDate)} 08:00</b></span>`);
    }
    let html = `<div class="status-chips">${parts.join('')}</div>`;
    if (showSnapshot && st.changedSinceSnapshot) {
      html += `<div class="notice">마지막 스냅샷 이후 변경된 보유가 있습니다. 다음 스냅샷(${Fmt.md(st.nextSnapshotDate)} 08:00)에 저장됩니다.</div>`;
    }
    return html;
  }

  // 현재 현황 모델 로드
  async function loadCurrentModel() {
    const [accounts, holdings, instruments, prices, fxInfo, status] = await Promise.all([
      DataService.getAccounts(), DataService.getHoldings(), DataService.getInstruments(),
      DataService.getPrices(), DataService.getFxRate(), DataService.getStatus()
    ]);
    const model = Calc.buildModel({ accounts, holdings, instruments, prices, fx: fxInfo.rate });
    return { model, accounts, holdings, instruments, prices, fxInfo, status };
  }

  return {
    get mode() { return app.mode; },
    MODES, init, rerender, modal, confirm, alert, toast, statusBar, loadCurrentModel
  };
})();
