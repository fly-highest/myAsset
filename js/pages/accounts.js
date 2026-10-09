// 계좌 현황 (accounts.html) — 계좌 → 보유 종목 트리, 조회 전용
// 계좌·보유 수정, 엑셀 다운로드·업로드는 계좌/자산관리(manage.html) 화면에서 합니다.
(function () {
  const st = { filterGroup: 'ALL', sortBy: 'default', collapsed: new Set() };
  let pendingHash = decodeURIComponent(location.hash.slice(1));

  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const mode = App.mode;
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-hd">
        <div><h1>계좌 현황</h1><p class="desc">계좌별 보유 종목 현황입니다 (조회 전용). 수정은 <a href="manage.html#accounts">계좌/자산관리 › 계좌 관리</a>에서 합니다.</p></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        ${UI.treeSection(model, mode, st, { editable: false, showUpdated: true })}
        <p class="small muted">자산군을 클릭하면 자산군 현황의 해당 위치로 이동합니다.
          회색 <span class="gbadge unassigned">기타종목<small>미지정</small></span>은 자산군 미지정 종목입니다.</p>
      </div>`;
    UI.bindTree(main, model, st);

    if (pendingHash) {
      const row = main.querySelector(`[data-acc="${CSS.escape(pendingHash)}"]`);
      pendingHash = '';
      if (row) row.scrollIntoView({ block: 'center' });
    }
  }

  App.init('accounts', render);
})();
