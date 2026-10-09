// Dashboard (index.html) — 전체 요약, 조회 전용 (10항)
(function () {
  async function render() {
    const { model, status } = await App.loadCurrentModel();
    const mode = App.mode;
    const total = model.total.valK;

    const accRows = model.accounts.map(acc => {
      const v = Calc.view(acc.agg, mode, model.fx);
      return `<tr><td><a href="accounts.html#${encodeURIComponent(acc.id)}">${esc(acc.name)}</a>${acc.account.account_type ? ` <span class="tag acc-type">${esc(acc.account.account_type)}</span>` : ''} <span class="muted small">${esc(acc.broker)}</span>${acc.account.memo ? `<div class="acc-memo">${esc(acc.account.memo)}</div>` : ''}</td>
        <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.prof(v, { split: false })}</td><td class="num">${UI.ret(v)}</td>
        <td class="num">${UI.weight(UI.w(acc.agg.valK, total))}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted center">계좌가 없습니다</td></tr>';

    document.getElementById('main').innerHTML = `
      <div class="page-hd"><div><h1>Dashboard</h1><p class="desc">전체 자산 요약입니다. 이 화면은 조회 전용이며, 수정은 각 화면에서 합니다.</p></div></div>
      ${App.statusBar(status)}
      <div class="sec">
        ${UI.totalsCards(model.total, mode, model.fx)}
        <div class="small muted" style="margin-top:6px">비중은 통화 모드와 관계없이 원화 환산 평가금액 기준</div>
      </div>
      <div class="sec grid-2">
        <div>
          <div class="sec-hd"><h2>자산군별 요약</h2><a href="groups.html">자산군 현황에서 보기·관리 →</a></div>
          ${UI.groupTable(model, mode)}
        </div>
        <div class="card pad">
          <div class="sec-hd"><h2>자산군 비중</h2><span class="small muted">원화 환산 기준</span></div>
          <div class="chart-box"><canvas id="ch-group"></canvas></div>
        </div>
      </div>
      <div class="sec grid-2e">
        <div>
          <div class="sec-hd"><h2>계좌별 비중</h2><a href="accounts.html">계좌 관리 →</a></div>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>계좌</th><th class="num">평가금액</th><th class="num">손익</th><th class="num">수익률</th><th class="num">비중</th></tr></thead>
            <tbody>${accRows}</tbody></table></div>
        </div>
        <div class="card pad">
          <div class="sec-hd"><h2>최근 3개월 추이</h2><a href="history.html">이력 →</a></div>
          <div class="chart-box"><canvas id="ch-trend"></canvas></div>
          <div class="small muted">매일 08:00 스냅샷 기준 (현재 현황과 다를 수 있음)</div>
        </div>
      </div>`;

    Charts.doughnut('ch-group', Groups.list.map(g => g.name), Groups.list.map(g => Math.max(0, model.groups[g.code].agg.valK)), Groups.list.map(g => g.color));
    const snaps = await DataService.getSnapshots('3M');
    Charts.trend('ch-trend', await Charts.snapshotSeries(snaps, mode));
  }
  App.init('dashboard', render);
})();
