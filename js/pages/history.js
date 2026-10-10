// 이력 (history.html) — 과거 스냅샷 조회 (17~21항)
(function () {
  let range = '3M'; // 'CUSTOM' 이면 custom.from ~ custom.to
  let custom = { from: '', to: '' };
  let lastView = null; // 엑셀 다운로드용 최근 화면 데이터
  const RANGES = [['1W', '1주'], ['1M', '1개월'], ['3M', '3개월'], ['6M', '6개월'], ['1Y', '1년'], ['ALL', '전체']];
  const modelCache = new Map();
  // 스냅샷 모델 캐시: 같은 id 라도 다시 만든 스냅샷(생성 시각·금시세가 다름)은 새로 계산, 항목이 비어 있으면 저장하지 않음
  async function snapModel(s) {
    const key = `${s.id}|${s.created_at || ''}|${s.xau_usd || ''}`;
    if (!modelCache.has(key)) {
      const items = await DataService.getSnapshotItems(s.id);
      const m = Calc.buildSnapshotModel(items);
      m.gold = s.xau_usd || await DataService.xauOn(s.snapshot_date); // 금환산: 스냅샷에 저장된 그날 국제 금시세(없으면 일별 금시세)
      if (!items.length) return m;
      modelCache.set(key, m);
    }
    return modelCache.get(key);
  }

  async function render() {
    const mode = App.mode;
    const [status, snaps] = await Promise.all([DataService.getStatus(), DataService.getSnapshots(range === 'CUSTOM' ? custom : range)]);
    const today = Fmt.todayKST();
    const fromVal = range === 'CUSTOM' ? custom.from : (snaps[0] ? snaps[0].snapshot_date : '');
    const toVal = range === 'CUSTOM' ? custom.to : today;
    const models = await Promise.all(snaps.map(snapModel));
    lastView = { snaps, models, fromVal: snaps[0] ? snaps[0].snapshot_date : '', toVal: snaps.length ? snaps[snaps.length - 1].snapshot_date : '' };
    const last = snaps[snaps.length - 1];

    // 날짜별 자산 현황 표 (최근 날짜가 위) — 자산 현황 화면과 같은 양식 (UI.statusTable)
    const table = UI.statusTable(snaps.map((s, i) => ({ label: s.snapshot_date, sub: s.snapshot_time, tag: s.initial ? '최초 데이터' : s.simulated ? '시뮬레이션' : '', model: models[i] })).reverse(), mode, { empty: '스냅샷이 없습니다' });

    document.getElementById('main').innerHTML = `
      <div class="page-hd">
        <div><h1>이력</h1><p class="desc">매일 08:00 KST 스냅샷으로 저장된 과거 자산 현황입니다. 과거 값은 당시 가격·환율·매입환율·자산군·계좌명으로 계산하며 이후 변경되지 않습니다.</p></div>
        ${status.realHistory ? '' : '<div class="toolbar"><button type="button" class="btn" id="btn-sim" title="Mock 검수용">08:00 스냅샷 생성 시뮬레이션</button></div>'}
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
        <div class="card pad"><div class="sec-hd"><h2>자산군 비중 추이</h2><span class="small muted">${mode === 'USD' ? '당시 분류 · 달러 환산(당시 환율)' : mode === 'GOLD' ? '당시 분류 · 금 환산(그날 금 시세, g)' : mode === 'KRW' ? '당시 분류 · 원화 환산' : '당시 분류 · 위: 원화 자산(₩) / 아래: 달러 자산($)'}</span></div>${mode === 'MIXED'
          ? '<div class="chart-box half"><canvas id="ch-share-kr"></canvas></div><div class="chart-box half"><canvas id="ch-share-us"></canvas></div>'
          : '<div class="chart-box"><canvas id="ch-share"></canvas></div>'}</div>
      </div>
      <div class="sec">
        <div class="sec-hd"><h2>날짜별 자산 현황</h2><div class="toolbar"><span class="small muted">자산군은 당시 분류 · 비중은 ${mode === 'MIXED' ? '통화별 자산 안에서의 비중' : '원화 환산 기준'}</span><button type="button" class="btn btn-sm" id="btn-xlsx" title="지금 선택한 기간의 표를 원화환산·달러환산·통화별 3개 탭으로 내려받습니다">엑셀 다운로드</button></div></div>
        ${table}
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
    main.querySelector('#btn-xlsx').onclick = exportXlsx;
    if (main.querySelector('#btn-sim')) main.querySelector('#btn-sim').onclick = async () => {
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

  // 엑셀: 화면의 통화 버튼과 관계없이 3개 탭(원화환산 / 달러환산 / 통화별)을 한 파일로
  // 각 탭 = 1~2행 기준정보 + '날짜별 자산 현황' 표 (지금 선택한 기간, 최근 날짜가 위)
  function exportXlsx() {
    const { snaps, models, fromVal, toVal } = lastView;
    if (!snaps.length) { App.toast('내려받을 스냅샷이 없습니다.', 'error'); return; }
    const F = UI.XF, r2 = v => Math.round(v * 100) / 100;
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const money = (v, c) => (c === 'USD' ? r2(v) : Math.round(v));
    const gNames = Groups.list.map(g => g.name);
    const info = `기간 ${fromVal} ~ ${toVal} (${snaps.length}일) · 자산군은 스냅샷 당시 분류 · 각 날짜 08:00 스냅샷의 당시 가격·환율·매입환율로 계산 · 내려받은 시각 ${Fmt.mdhm(new Date().toISOString())}`;
    const ordered = snaps.map((s, i) => ({ s, m: models[i] })).reverse();

    function sheet(mode, title) {
      const mixed = mode === 'MIXED';
      const note = { KRW: '금액 = 원화(₩) · 비중 = 원화 환산 기준 전체 대비', USD: '금액 = 그날 환율로 나눈 달러($) · 비중 = 원화 환산 기준 전체 대비', MIXED: '원화 줄 = 원화 자산만(₩), 달러 줄 = 달러 자산만($) · 비중 = 그 통화 자산 안에서' }[mode];
      const rows = [[`[${title}] ${note}`], [info],
        ['날짜', '시각', '표시 통화', '총 평가금액', '총 투자금액', '총 손익', '총 수익률(%)', '환율(USD/KRW)',
          ...gNames.map(n => `${n} 총액`), ...gNames.map(n => `${n} 비중(%)`)]];
      ordered.forEach(({ s, m }) => {
        if (!mixed) {
          const c = mode === 'USD' ? 'USD' : 'KRW';
          const v = Calc.view(m.total, mode, m.fx, m.gold).parts[0];
          rows.push([s.snapshot_date, s.snapshot_time, c === 'USD' ? 'USD($)' : 'KRW(₩)', money(v.val, c), money(v.inv, c), money(v.prof, c), r2(v.ret), m.fx,
            ...Groups.list.map(g => money(Calc.view(m.groups[g.code].agg, mode, m.fx, m.gold).parts[0].val, c)),
            ...Groups.list.map(g => r2(pct(m.groups[g.code].agg.valK, m.total.valK)))]);
          return;
        }
        [['KRW', 'kr'], ['USD', 'us']].forEach(([c, k]) => {
          const t = m.total[k], p = t.val - t.inv;
          const has = a => (k === 'kr' ? a.nKR : a.nUS);
          rows.push([s.snapshot_date, s.snapshot_time, c === 'USD' ? 'USD($)' : 'KRW(₩)', money(t.val, c), money(t.inv, c), money(p, c), r2(pct(p, t.inv)), m.fx,
            ...Groups.list.map(g => { const a = m.groups[g.code].agg; return has(a) ? money(a[k].val, c) : ''; }),
            ...Groups.list.map(g => { const a = m.groups[g.code].agg; return has(a) ? r2(pct(a[k].val, t.val)) : ''; })]);
        });
      });
      return rows;
    }
    // 셀 형식: 금액은 그 행의 표시 통화(₩ 정수 / $ 소수 2자리)
    const nG = gNames.length;
    const formatFn = (row, c) => {
      if (row[2] !== 'KRW(₩)' && row[2] !== 'USD($)') return null;
      const isUsd = row[2] === 'USD($)';
      if ((c >= 3 && c <= 5) || (c >= 8 && c < 8 + nG)) return isUsd ? F.usd : F.krw;
      if (c === 6 || c >= 8 + nG) return F.pct;
      if (c === 7) return F.fx;
      return null;
    };
    const widths = [11, 6, 9, 15, 15, 14, 11, 12, ...gNames.map(() => 14), ...gNames.map(() => 11)];
    UI.downloadXlsx(`myAsset_이력_${fromVal}_${toVal}.xlsx`, [
      { name: '원화환산', rows: sheet('KRW', '원화환산'), widths, formatFn },
      { name: '달러환산', rows: sheet('USD', '달러환산'), widths, formatFn },
      { name: '통화별', rows: sheet('MIXED', '통화별'), widths, formatFn }
    ]);
  }

  DataService.onChange(() => modelCache.clear());
  App.init('history', render);
})();
