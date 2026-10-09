// 이력 (history.html) — 과거 스냅샷 조회 (17~21항)
(function () {
  let range = '3M'; // 'CUSTOM' 이면 custom.from ~ custom.to
  let custom = { from: '', to: '' };
  let selectedId = null;
  let tab = 'group';
  const RANGES = [['1W', '1주'], ['1M', '1개월'], ['3M', '3개월'], ['6M', '6개월'], ['1Y', '1년'], ['ALL', '전체']];
  const modelCache = new Map();

  async function snapModel(s) {
    if (!modelCache.has(s.id)) modelCache.set(s.id, Calc.buildSnapshotModel(await DataService.getSnapshotItems(s.id)));
    return modelCache.get(s.id);
  }

  async function render() {
    const mode = App.mode;
    const [status, snaps, cur] = await Promise.all([DataService.getStatus(), DataService.getSnapshots(range === 'CUSTOM' ? custom : range), App.loadCurrentModel()]);
    const today = Fmt.todayKST();
    const fromVal = range === 'CUSTOM' ? custom.from : (snaps[0] ? snaps[0].snapshot_date : '');
    const toVal = range === 'CUSTOM' ? custom.to : today;
    const models = await Promise.all(snaps.map(snapModel));
    if (!snaps.find(s => s.id === selectedId)) selectedId = snaps.length ? snaps[snaps.length - 1].id : null;
    const selIdx = snaps.findIndex(s => s.id === selectedId);
    const sel = snaps[selIdx], selModel = models[selIdx];
    const last = snaps[snaps.length - 1], lastModel = models[models.length - 1];

    const listRows = snaps.map((s, i) => ({ s, m: models[i] })).reverse().map(({ s, m }) => {
      const v = Calc.view(m.total, mode, m.fx);
      return `<tr class="clickable ${s.id === selectedId ? 'sel' : ''}" data-snap="${s.id}">
        <td class="nowrap">${s.snapshot_date} <span class="muted small">${s.snapshot_time}</span>${s.simulated ? ' <span class="tag">시뮬레이션</span>' : ''}</td>
        <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v, { split: false })}</td><td class="num">${UI.ret(v)}</td>
        <td class="num">${Fmt.fx(m.fx || 0)}</td></tr>`;
    }).join('');

    const compare = last ? (() => {
      const a = Calc.view(lastModel.total, mode, lastModel.fx), b = Calc.view(cur.model.total, mode, cur.model.fx);
      const row = (t, fa, fb) => `<tr><td>${t}</td><td class="num">${fa}</td><td class="num">${fb}</td></tr>`;
      return `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th><th class="num">최신 스냅샷 (${Fmt.md(last.snapshot_date)} ${last.snapshot_time})</th><th class="num">현재 현황 (실시간 계산)</th></tr></thead>
        <tbody>${row('평가금액', UI.amt(a, 'val'), UI.amt(b, 'val'))}${row('투자금액', UI.amt(a, 'inv'), UI.amt(b, 'inv'))}
        ${row('손익', UI.prof(a), UI.prof(b))}${row('수익률', UI.ret(a), UI.ret(b))}
        ${row('적용 환율', Fmt.fx(lastModel.fx || 0), Fmt.fx(cur.model.fx))}</tbody></table></div>
        <p class="small muted">스냅샷은 매일 08:00 상태를 저장한 값이고, 현재 현황은 지금 보유·가격·환율로 실시간 계산한 값이라 서로 다를 수 있습니다.</p>`;
    })() : '';

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
        <div class="sec-hd"><h2>최신 스냅샷 vs 현재 현황</h2></div>
        ${compare}
      </div>
      <div class="sec grid-2e">
        <div>
          <div class="sec-hd"><h2>날짜별 총합</h2><span class="small muted">행을 클릭하면 오른쪽에 상세가 표시됩니다</span></div>
          <div class="tbl-wrap scroll-y" style="max-height:620px"><table class="tbl">
            <thead><tr><th>날짜</th><th class="num">총 평가금액</th><th class="num">총 투자금액</th><th class="num">총 손익</th><th class="num">총 수익률</th><th class="num">환율</th></tr></thead>
            <tbody>${listRows || '<tr><td colspan="6" class="muted center">스냅샷이 없습니다</td></tr>'}</tbody></table></div>
        </div>
        <div id="detail">${sel ? detail(sel, selModel, mode) : ''}</div>
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
    main.querySelectorAll('[data-snap]').forEach(tr => tr.onclick = () => { selectedId = tr.dataset.snap; App.rerender(); });
    main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; App.rerender(); });
    main.querySelector('#btn-sim').onclick = async () => {
      const ok = await App.confirm(`<b>${status.nextSnapshotDate} 08:00</b> 스냅샷을 지금의 보유 상태로 생성합니다.<br><small>Mock 검수용 기능입니다. 생성된 스냅샷은 이후 보유를 바꿔도 변하지 않습니다.</small>`, { okLabel: '생성' });
      if (!ok) return;
      try {
        const s = await DataService.createDailySnapshot();
        selectedId = s.id;
        App.toast(`${s.snapshot_date} 08:00 스냅샷을 생성했습니다.`);
      } catch (e) { App.alert(esc(e.message)); }
    };

    Charts.trend('ch-trend', await Charts.snapshotSeries(snaps, mode));
    Charts.groupShare('ch-share', snaps, models, mode);
  }

  function detail(s, m, mode) {
    const total = m.total.valK;
    const v = Calc.view(m.total, mode, m.fx);
    const tabs = [['group', '자산군별'], ['account', '계좌별'], ['inst', '종목별']];
    let table = '';
    const head = first => `<thead><tr><th>${first}</th><th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th><th class="num">비중</th></tr></thead>`;
    const cells = a => { const x = Calc.view(a, mode, m.fx); return `<td class="num">${UI.amt(x, 'val')}</td><td class="num">${UI.amt(x, 'inv')}</td><td class="num">${UI.prof(x)}</td><td class="num">${UI.ret(x)}</td><td class="num">${UI.weight(UI.w(a.valK, total), false)}</td>`; };
    if (tab === 'group') {
      table = head('자산군 (당시 분류)') + '<tbody>' + Groups.list.map(g => `<tr><td><span class="dot" style="background:${g.color}"></span>${g.name}</td>${cells(m.groups[g.code].agg)}</tr>`).join('') + '</tbody>';
    } else if (tab === 'account') {
      table = head('계좌 (당시 계좌명)') + '<tbody>' + m.accounts.map(a => `<tr><td>${esc(a.name)}</td>${cells(a.agg)}</tr>`).join('') + '</tbody>';
    } else {
      const accName = Object.fromEntries(m.accounts.map(a => [a.key, a.name]));
      let rows = '';
      Groups.list.forEach(g => {
        Object.values(m.groups[g.code].insts).sort((a, b) => b.agg.valK - a.agg.valK).forEach(I => {
          rows += `<tr><td><b>${esc(I.inst.name)}</b> <span class="muted small">${esc(I.inst.symbol)}</span> ${UI.groupBadge(g.code, false, { link: false })}</td>${cells(I.agg)}</tr>`;
          if (I.rows.length > 1) I.rows.forEach(x => {
            rows += `<tr class="a-row"><td>${esc(accName[x.accKey])} · ${Fmt.qty(x.r.q, I.inst)}</td>${cells(Calc.add(Calc.emptyAgg(), x.r))}</tr>`;
          });
        });
      });
      table = head('종목 (당시 자산군)') + `<tbody>${rows}</tbody>`;
    }
    return `
      <div class="sec-hd"><h2>${s.snapshot_date} ${s.snapshot_time} 상세</h2><span class="small muted">당시 환율 ${Fmt.fx(m.fx || 0)}</span></div>
      <div class="card pad" style="margin-bottom:10px">
        <div class="compare">
          <div><div class="stat-t">총 평가금액</div>${UI.amt(v, 'val')}</div>
          <div><div class="stat-t">총 투자금액</div>${UI.amt(v, 'inv')}</div>
          <div><div class="stat-t">총 손익</div>${UI.prof(v)}</div>
          <div><div class="stat-t">총 수익률</div>${UI.ret(v)}</div>
        </div>
      </div>
      <div class="tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="tbl">${table}</table></div>`;
  }

  DataService.onChange(() => modelCache.clear());
  App.init('history', render);
})();
