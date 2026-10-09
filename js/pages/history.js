// 이력 (history.html) — 과거 스냅샷 조회 (17~21항)
(function () {
  let range = '3M'; // 'CUSTOM' 이면 custom.from ~ custom.to
  let custom = { from: '', to: '' };
  const RANGES = [['1W', '1주'], ['1M', '1개월'], ['3M', '3개월'], ['6M', '6개월'], ['1Y', '1년'], ['ALL', '전체']];
  const modelCache = new Map();

  async function snapModel(s) {
    if (!modelCache.has(s.id)) modelCache.set(s.id, Calc.buildSnapshotModel(await DataService.getSnapshotItems(s.id)));
    return modelCache.get(s.id);
  }

  async function render() {
    const mode = App.mode;
    const [status, snaps] = await Promise.all([DataService.getStatus(), DataService.getSnapshots(range === 'CUSTOM' ? custom : range)]);
    const today = Fmt.todayKST();
    const fromVal = range === 'CUSTOM' ? custom.from : (snaps[0] ? snaps[0].snapshot_date : '');
    const toVal = range === 'CUSTOM' ? custom.to : today;
    const models = await Promise.all(snaps.map(snapModel));
    const last = snaps[snaps.length - 1];

    // 날짜별 자산 현황 표: 총합 + 자산군별 총액·비중 (최근 날짜가 위)
    const rows = snaps.map((s, i) => ({ s, m: models[i] })).reverse().map(({ s, m }) => {
      const v = Calc.view(m.total, mode, m.fx);
      // 자산군별 총액 7칸 → 자산군별 비중 7칸 순서
      const amounts = Groups.list.map((g, i) => `<td class="num${i === 0 ? ' g-first' : ''}">${UI.amt(Calc.view(m.groups[g.code].agg, mode, m.fx), 'val')}</td>`).join('');
      const weights = Groups.list.map((g, i) => `<td class="num${i === 0 ? ' g-first' : ''}">${Fmt.weight(UI.w(m.groups[g.code].agg.valK, m.total.valK))}</td>`).join('');
      const groups = amounts + weights;
      return `<tr>
        <td class="nowrap sticky-col">${s.snapshot_date} <span class="muted small">${s.snapshot_time}</span>${s.simulated ? ' <span class="tag">시뮬레이션</span>' : ''}</td>
        <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v, { split: false })}</td><td class="num">${UI.ret(v)}</td>
        <td class="num">${Fmt.fx(m.fx || 0)}</td>${groups}</tr>`;
    }).join('');

    document.getElementById('main').innerHTML = `
      <div class="page-hd">
        <div><h1>이력</h1><p class="desc">매일 08:00 KST 스냅샷으로 저장된 과거 자산 현황입니다. 과거 값은 당시 가격·환율·매입환율·자산군·계좌명으로 계산하며 이후 변경되지 않습니다.</p></div>
        <div class="toolbar"><button type="button" class="btn" id="btn-sim" title="Mock 검수용 — 실제 연동 시 제거됩니다">08:00 스냅샷 생성 시뮬레이션</button></div>
      </div>
      ${App.statusBar(status, { showBase: false })}
      <div class="sec toolbar">
        <div class="period">${RANGES.map(([k, l]) => `<button type="button" data-range="${k}" class="${k === range ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="toolbar date-range">
          <input type="date" id="d-from" value="${fromVal}" max="${today}" aria-label="시작일">
          <span class="muted">~</span>
          <input type="date" id="d-to" value="${toVal}" max="${today}" aria-label="종료일">
        </div>
        <span class="small muted">${snaps.length}일${snaps.length ? ` · ${snaps[0].snapshot_date} ~ ${last.snapshot_date}` : ' · 해당 기간에 스냅샷이 없습니다'}</span>
      </div>
      <div class="sec grid-2e">
        <div class="card pad"><div class="sec-hd"><h2>총 평가금액 · 투자금액 추이</h2></div><div class="chart-box"><canvas id="ch-trend"></canvas></div></div>
        <div class="card pad"><div class="sec-hd"><h2>자산군 비중 추이</h2><span class="small muted">${mode === 'USD' ? '당시 분류 · 달러 환산(당시 환율)' : mode === 'KRW' ? '당시 분류 · 원화 환산' : '당시 분류 · 혼합 모드는 통화를 합치지 않아 비중(%)으로 표시'}</span></div><div class="chart-box"><canvas id="ch-share"></canvas></div></div>
      </div>
      <div class="sec">
        <div class="sec-hd"><h2>날짜별 자산 현황</h2><span class="small muted">자산군은 당시 분류 · 비중은 원화 환산 기준</span></div>
        <div class="tbl-wrap hist-wrap"><table class="tbl hist">
          <thead>
            <tr>
              <th rowspan="2" class="sticky-col">날짜</th><th rowspan="2" class="num">총 평가금액</th><th rowspan="2" class="num">총 투자금액</th>
              <th rowspan="2" class="num">총 손익</th><th rowspan="2" class="num">총 수익률</th><th rowspan="2" class="num">환율</th>
              <th colspan="${Groups.list.length}" class="center g-first">자산군별 총액</th>
              <th colspan="${Groups.list.length}" class="center g-first">자산군별 비중 <span class="muted">(원화 환산 기준)</span></th>
            </tr>
            <tr>${[0, 1].map(() => Groups.list.map((g, i) => `<th class="num${i === 0 ? ' g-first' : ''}"><span class="dot" style="background:${g.color}"></span>${g.name}</th>`).join('')).join('')}</tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${6 + Groups.list.length * 2}" class="muted">스냅샷이 없습니다</td></tr>`}</tbody>
        </table></div>
      </div>`;

    const main = document.getElementById('main');
    main.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { range = b.dataset.range; App.rerender(); });
    const onDate = () => {
      let f = main.querySelector('#d-from').value, t = main.querySelector('#d-to').value || today;
      if (f && t && f > t) [f, t] = [t, f];
      custom = { from: f, to: t };
      range = 'CUSTOM';
      App.rerender();
    };
    main.querySelector('#d-from').onchange = onDate;
    main.querySelector('#d-to').onchange = onDate;
    main.querySelector('#btn-sim').onclick = async () => {
      const ok = await App.confirm(`<b>${status.nextSnapshotDate} 08:00</b> 스냅샷을 지금의 보유 상태로 생성합니다.<br><small>Mock 검수용 기능입니다. 생성된 스냅샷은 이후 보유를 바꿔도 변하지 않습니다.</small>`, { okLabel: '생성' });
      if (!ok) return;
      try {
        const s = await DataService.createDailySnapshot();
        App.toast(`${s.snapshot_date} 08:00 스냅샷을 생성했습니다.`);
      } catch (e) { App.alert(esc(e.message)); }
    };

    Charts.trend('ch-trend', await Charts.snapshotSeries(snaps, mode));
    Charts.groupShare('ch-share', snaps, models, mode);
  }

  DataService.onChange(() => modelCache.clear());
  App.init('history', render);
})();
