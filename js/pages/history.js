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
    const mixed = mode === 'MIXED';
    const gcell = (i, html) => `<td class="num${i === 0 ? ' g-first' : ''}">${html}</td>`;
    const dateCell = (s, span) => `<td class="nowrap sticky-col"${span ? ` rowspan="${span}"` : ''}>${s.snapshot_date} <span class="muted small">${s.snapshot_time}</span>${s.simulated ? ' <span class="tag">시뮬레이션</span>' : ''}</td>`;
    const rows = snaps.map((s, i) => ({ s, m: models[i] })).reverse().map(({ s, m }) => {
      if (!mixed) {
        // 원화환산·달러환산: 날짜당 1줄. 자산군별 총액 7칸 → 자산군별 비중 7칸 (비중은 원화 환산 기준)
        const v = Calc.view(m.total, mode, m.fx);
        const amounts = Groups.list.map((g, i) => gcell(i, UI.amt(Calc.view(m.groups[g.code].agg, mode, m.fx), 'val'))).join('');
        const weights = Groups.list.map((g, i) => gcell(i, Fmt.weight(UI.w(m.groups[g.code].agg.valK, m.total.valK)))).join('');
        return `<tr>${dateCell(s)}
          <td class="num">${UI.amt(v, 'val')}</td><td class="num">${UI.amt(v, 'inv')}</td><td class="num">${UI.prof(v, { split: false })}</td><td class="num">${UI.ret(v)}</td>
          <td class="num">${Fmt.fx(m.fx || 0)}</td>${amounts}${weights}</tr>`;
      }
      // 혼합 모드: 날짜당 원화 줄 + 달러 줄. 원화 = 원화 자산만(₩), 달러 = 달러 자산만($). 비중은 그 통화 자산 안에서.
      return [['KRW', '원화', 'kr'], ['USD', '달러', 'us']].map(([cur, label, k], idx) => {
        const t = m.total[k], prof = t.val - t.inv, ret = Calc.pct(prof, t.inv);
        const amounts = Groups.list.map((g, i) => {
          const a = m.groups[g.code].agg;
          return gcell(i, (k === 'kr' ? a.nKR : a.nUS) ? Fmt.money(a[k].val, cur) : '<span class="muted">—</span>');
        }).join('');
        const weights = Groups.list.map((g, i) => {
          const a = m.groups[g.code].agg;
          return gcell(i, (k === 'kr' ? a.nKR : a.nUS) ? Fmt.weight(UI.w(a[k].val, t.val)) : '<span class="muted">—</span>');
        }).join('');
        return `<tr class="${idx === 0 ? 'pair-top' : 'pair-bottom'}">${idx === 0 ? dateCell(s, 2) : ''}
          <td class="cur-col">${label}</td>
          <td class="num">${Fmt.money(t.val, cur)}</td><td class="num">${Fmt.money(t.inv, cur)}</td>
          <td class="num ${Fmt.cls(prof, cur)}">${Fmt.signedMoney(prof, cur)}</td><td class="num ${Fmt.cls(ret, 'PCT')}">${Fmt.pct(ret)}</td>
          ${idx === 0 ? `<td class="num" rowspan="2">${Fmt.fx(m.fx || 0)}</td>` : ''}${amounts}${weights}</tr>`;
      }).join('');
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
          ${dateBox('d-from', fromVal, today, '시작일')}
          <span class="muted">~</span>
          ${dateBox('d-to', toVal, today, '종료일')}
        </div>
        <span class="small muted">${snaps.length}일${snaps.length ? ` · ${snaps[0].snapshot_date} ~ ${last.snapshot_date}` : ' · 해당 기간에 스냅샷이 없습니다'}</span>
      </div>
      <div class="sec grid-2e">
        <div class="card pad"><div class="sec-hd"><h2>총 평가금액 · 투자금액 추이</h2></div><div class="chart-box"><canvas id="ch-trend"></canvas></div></div>
        <div class="card pad"><div class="sec-hd"><h2>자산군 비중 추이</h2><span class="small muted">${mode === 'USD' ? '당시 분류 · 달러 환산(당시 환율)' : mode === 'KRW' ? '당시 분류 · 원화 환산' : '당시 분류 · 위: 원화 자산(₩) / 아래: 달러 자산($)'}</span></div>${mode === 'MIXED'
          ? '<div class="chart-box half"><canvas id="ch-share-kr"></canvas></div><div class="chart-box half"><canvas id="ch-share-us"></canvas></div>'
          : '<div class="chart-box"><canvas id="ch-share"></canvas></div>'}</div>
      </div>
      <div class="sec">
        <div class="sec-hd"><h2>날짜별 자산 현황</h2><span class="small muted">자산군은 당시 분류 · 비중은 ${mode === 'MIXED' ? '통화별 자산 안에서의 비중' : '원화 환산 기준'}</span></div>
        <div class="tbl-wrap hist-wrap"><table class="tbl hist">
          <thead>
            <tr>
              <th rowspan="2" class="sticky-col">날짜</th>${mixed ? '<th rowspan="2">통화</th>' : ''}<th rowspan="2" class="num">총 평가금액</th><th rowspan="2" class="num">총 투자금액</th>
              <th rowspan="2" class="num">총 손익</th><th rowspan="2" class="num">총 수익률</th><th rowspan="2" class="num">환율</th>
              <th colspan="${Groups.list.length}" class="center g-first">자산군별 총액</th>
              <th colspan="${Groups.list.length}" class="center g-first">자산군별 비중 <span class="muted">${mixed ? '(통화별 자산 안에서)' : '(원화 환산 기준)'}</span></th>
            </tr>
            <tr>${[0, 1].map(() => Groups.list.map((g, i) => `<th class="num${i === 0 ? ' g-first' : ''}"><span class="dot" style="background:${g.color}"></span>${g.name}</th>`).join('')).join('')}</tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${(mixed ? 7 : 6) + Groups.list.length * 2}" class="muted">스냅샷이 없습니다</td></tr>`}</tbody>
        </table></div>
      </div>`;

    const main = document.getElementById('main');
    main.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { range = b.dataset.range; App.rerender(); });
    // 날짜 칸: 숫자를 직접 입력(예: 20260901 → 2026-09-01)하고 Enter 또는 칸 밖을 누르면 적용, 달력 버튼으로도 선택 가능
    const applyDates = () => {
      const fEl = main.querySelector('#d-from'), tEl = main.querySelector('#d-to');
      let f = fEl.value.trim(), t = tEl.value.trim() || today;
      const bad = [fEl, tEl].filter(el => el.value.trim() && !validDate(el.value.trim()));
      [fEl, tEl].forEach(el => el.classList.toggle('invalid', bad.includes(el)));
      if (bad.length) { App.toast('날짜는 2026-09-01 처럼 입력해 주세요.', 'error'); return; }
      if (f > today) f = today;
      if (t > today) t = today;
      if (f && f > t) [f, t] = [t, f];
      if (range === 'CUSTOM' && custom.from === f && custom.to === t) return;
      custom = { from: f, to: t };
      range = 'CUSTOM';
      App.rerender();
    };
    main.querySelectorAll('.date-box').forEach(box => {
      const txt = box.querySelector('input[type=text]'), pick = box.querySelector('input[type=date]');
      const before = txt.value;
      txt.addEventListener('input', () => {
        const d = txt.value.replace(/\D/g, '').slice(0, 8);
        txt.value = d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
        txt.classList.remove('invalid');
      });
      txt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyDates(); } if (e.key === 'Escape') { txt.value = before; txt.blur(); } });
      // 칸 밖으로 나가면 적용 (시작일 → 종료일로 옮겨 갈 때는 적용하지 않고 계속 입력)
      txt.addEventListener('blur', () => setTimeout(() => {
        if (main.querySelector('.date-range').contains(document.activeElement)) return;
        const changed = [...main.querySelectorAll('.date-box input[type=text]')].some(el => el.value !== el.defaultValue);
        if (changed) applyDates();
      }, 0));
      box.querySelector('.cal-btn').onclick = () => {
        pick.value = validDate(txt.value) ? txt.value : '';
        try { pick.showPicker(); } catch (e) { pick.focus(); }
      };
      pick.addEventListener('change', () => { if (pick.value) { txt.value = pick.value; applyDates(); } });
    });
    main.querySelector('#btn-sim').onclick = async () => {
      const ok = await App.confirm(`<b>${status.nextSnapshotDate} 08:00</b> 스냅샷을 지금의 보유 상태로 생성합니다.<br><small>Mock 검수용 기능입니다. 생성된 스냅샷은 이후 보유를 바꿔도 변하지 않습니다.</small>`, { okLabel: '생성' });
      if (!ok) return;
      try {
        const s = await DataService.createDailySnapshot();
        App.toast(`${s.snapshot_date} 08:00 스냅샷을 생성했습니다.`);
      } catch (e) { App.alert(esc(e.message)); }
    };

    Charts.trend('ch-trend', await Charts.snapshotSeries(snaps, mode));
    if (mode === 'MIXED') {
      Charts.groupShare('ch-share-kr', snaps, models, mode, 'kr');
      Charts.groupShare('ch-share-us', snaps, models, mode, 'us');
    } else Charts.groupShare('ch-share', snaps, models, mode);
  }

  // 날짜 입력 칸 (직접 입력 + 달력 버튼)
  function dateBox(id, value, max, label) {
    return `<span class="date-box"><input type="text" id="${id}" value="${value}" placeholder="YYYY-MM-DD" maxlength="10" inputmode="numeric" autocomplete="off" aria-label="${label}" title="숫자만 입력해도 됩니다 (예: 20260901). Enter 로 적용">` +
      `<button type="button" class="cal-btn" title="달력에서 선택" aria-label="${label} 달력"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button>` +
      `<input type="date" class="date-pick" max="${max}" tabindex="-1" aria-hidden="true"></span>`;
  }
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }

  DataService.onChange(() => modelCache.clear());
  App.init('history', render);
})();
