// 계좌 현황 (accounts.html) — 계좌 → 보유 종목 트리, 조회 전용
// 계좌·보유 수정, 엑셀 업로드는 계좌/자산관리(manage.html) 화면에서 합니다.
(function () {
  // groupBy: 표의 계좌 묶기 기준 (증권사 기본 · 계좌종류 · 계좌명) — 이 브라우저에 기억
  const GB_KEY = 'myAsset.accounts.groupBy';
  let savedGB = null;
  try { savedGB = localStorage.getItem(GB_KEY); } catch (e) { /* 저장소 사용 불가 */ }
  const st = {
    filterGroup: 'ALL', sortBy: 'default', collapsed: new Set(),
    groupBy: ['broker', 'type', 'name'].includes(savedGB) ? savedGB : 'broker',
    onGroupBy: v => { try { localStorage.setItem(GB_KEY, v); } catch (e) { /* 무시 */ } }
  };
  let pendingHash = decodeURIComponent(location.hash.slice(1));
  let last = null; // 엑셀 다운로드용 최근 화면 데이터

  async function render() {
    const { model, status, fxInfo } = await App.loadCurrentModel();
    last = { model, status, fxInfo };
    const mode = App.mode;
    const main = document.getElementById('main');
    main.innerHTML = `
      <div class="page-hd">
        <div><h1>계좌 현황</h1><p class="desc">계좌별 보유 종목 현황입니다 (조회 전용). 수정은 <a href="manage.html#accounts">계좌/자산관리 › 계좌 관리</a>에서 합니다.</p></div>
        <div class="toolbar"><button type="button" class="btn" id="btn-xlsx" title="계좌·보유 현황을 원화환산·달러환산·통화별 3개 탭으로 내려받습니다">엑셀 다운로드</button></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        ${UI.treeSection(model, mode, st, { editable: false, showUpdated: true, groupSelect: true })}
        <p class="small muted">자산군을 클릭하면 자산 현황의 해당 위치로 이동합니다.
          회색 <span class="gbadge unassigned">기타종목<small>미지정</small></span>은 자산군 미지정 종목입니다.</p>
      </div>`;
    UI.bindTree(main, model, st);
    main.querySelector('#btn-xlsx').onclick = exportDialog;

    if (pendingHash) {
      const row = main.querySelector(`[data-acc="${CSS.escape(pendingHash)}"]`);
      pendingHash = '';
      if (row) row.scrollIntoView({ block: 'center' });
    }
  }

  // ---------------- 엑셀 다운로드 (PC 백업용) ----------------
  // [엑셀 다운로드] → 팝업: ① 현재 (기본, 최근 현재가 기준시각)  ② 기간 (이력의 날짜별 스냅샷 + 끝 날짜가 오늘이면 현재도)
  // 화면의 통화 버튼과 관계없이 3개 탭(원화환산 / 달러환산 / 통화별)을 한 파일로.
  // 각 탭 = 1행 설명 + 2행 기준정보 + 머리글 → (기준시각마다) 종목 행(계좌 순) … → 그 시각의 전체 합계
  // 맨 왼쪽 열 '기준시각' = YYYYMMDDHHmmss (KST, 텍스트): 현재 = 현재가 기준 시각, 이력 = 스냅샷 시각(08:00)
  const kstStamp = d => { const k = new Date(new Date(d).getTime() + 9 * 3600 * 1000).toISOString(); return k.slice(0, 4) + k.slice(5, 7) + k.slice(8, 10) + k.slice(11, 13) + k.slice(14, 16) + k.slice(17, 19); };
  const snapStamp = s => s.snapshot_date.replace(/-/g, '') + (/^\d\d:\d\d$/.test(s.snapshot_time) ? s.snapshot_time.replace(':', '') + '00' : '000000');

  async function exportDialog() {
    const ps = await DataService.getPriceStatus();
    const today = Fmt.todayKST();
    const all = await DataService.getSnapshots('ALL');
    const first = all.length ? all[0].snapshot_date : today;
    const nowStamp = kstStamp(ps.latestAsOf || new Date());
    App.modal({
      title: '엑셀 다운로드',
      body: `<div class="form">
        <label class="check"><input type="radio" name="xr" value="now" checked> <b>현재</b> <span class="muted small">— 현재가 기준 ${ps.latestAsOf ? Fmt.mdhm(ps.latestAsOf) : '예시 가격'} · 기준시각 ${nowStamp}</span></label>
        <label class="check"><input type="radio" name="xr" value="range"> <b>기간</b> <span class="muted small">— 이력(매일 08:00 스냅샷)에 저장된 날짜별 현황</span></label>
        <div id="xr-box" hidden style="padding-left:24px">
          <div class="toolbar"><input type="date" id="xr-from" value="${today}" min="${first}" max="${today}"> ~ <input type="date" id="xr-to" value="${today}" min="${first}" max="${today}"></div>
          <label class="check" style="margin-top:6px"><input type="checkbox" id="xr-now" checked> 끝 날짜가 오늘이면 현재 데이터도 함께</label>
          <div class="small muted" id="xr-cnt" style="margin-top:6px"></div>
        </div>
        <p class="small muted" style="margin:0">이력은 ${first}부터 있습니다. 탭 3개(원화환산·달러환산·통화별), 맨 왼쪽 '기준시각' 열로 시점을 구분합니다.</p>
        <div class="notice" id="xr-err" hidden></div></div>`,
      buttons: [{ label: '취소' }, {
        label: '다운로드', kind: 'primary', onClick: async api => {
          const b = api.body, err = msg => { const el = b.querySelector('#xr-err'); el.hidden = false; el.textContent = msg; };
          try {
            if (b.querySelector('input[name=xr]:checked').value === 'now') { await exportXlsx({ current: true }); api.close(); return; }
            const from = b.querySelector('#xr-from').value, to = b.querySelector('#xr-to').value;
            if (!from || !to || from > to) return err('시작 날짜가 끝 날짜보다 늦습니다.');
            const snaps = await DataService.getSnapshots({ from, to });
            const current = to >= today && b.querySelector('#xr-now').checked;
            if (!snaps.length && !current) return err('그 기간에 저장된 이력이 없습니다.');
            await exportXlsx({ snaps, current, from, to });
            api.close();
          } catch (e) { err('내려받지 못했습니다: ' + e.message); }
        }
      }]
    });
    const b = document.querySelector('.modal-backdrop:last-child .modal-bd');
    const upd = async () => {
      const range = b.querySelector('input[name=xr]:checked').value === 'range';
      b.querySelector('#xr-box').hidden = !range;
      if (!range) return;
      const from = b.querySelector('#xr-from').value, to = b.querySelector('#xr-to').value;
      const n = from && to && from <= to ? (await DataService.getSnapshots({ from, to })).length : 0;
      const cur = to >= today && b.querySelector('#xr-now').checked;
      b.querySelector('#xr-cnt').textContent = `이력 ${n}개 시점${cur ? ' + 현재' : ''}을 내려받습니다.`;
    };
    b.querySelectorAll('input').forEach(el => el.addEventListener('change', upd));
    upd();
  }

  async function exportXlsx({ current = false, snaps = [], from, to }) {
    const SRC = { GOOGLE: 'Google Finance', NAVER: '네이버 금융', UPBIT: '업비트', GOLD: '국제 금시세 환산', MANUAL: '직접 입력', MOCK: '예시 가격' };
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const r2 = v => Math.round(v * 100) / 100;
    const money = (v, cur) => (cur === 'USD' ? r2(v) : Math.round(v));
    const curLabel = c => (c === 'USD' ? 'USD($)' : 'KRW(₩)');
    const accNow = Object.fromEntries((await DataService.getAccounts()).map(a => [a.id, a])); // 이력 행의 증권사·계좌종류는 지금 계좌 정보로

    // 시점 목록: 이력 스냅샷(오래된 순) → 현재
    const entries = [];
    for (const s of snaps) {
      const model = Calc.buildSnapshotModel(await DataService.getSnapshotItems(s.id));
      entries.push({
        stamp: snapStamp(s), model, priceAt: `${s.snapshot_date} ${s.snapshot_time}`, src: () => '이력 스냅샷',
        acc: a => { const n = accNow[a.id] || {}; return { broker: n.broker || '', type: n.account_type || '' }; }
      });
    }
    if (current) {
      const ps = await DataService.getPriceStatus();
      entries.push({
        stamp: kstStamp(ps.latestAsOf || new Date()), model: last.model, priceAt: null,
        src: x => (x.priceMeta ? (SRC[x.priceMeta.source] || x.priceMeta.source) : (x.inst.asset_type === 'CASH' ? '현금' : '')),
        acc: a => ({ broker: a.broker || '', type: (a.account && a.account.account_type) || '' })
      });
    }
    const stamps = entries.map(e => e.stamp);
    const info = current && !snaps.length
      ? `기준시각 ${stamps[0]} (현재가 기준 시각, KST) · 현황 기준일 ${last.status.baseDate} (${last.status.baseSource}) · 적용 환율 ₩${last.fxInfo.rate} (${Fmt.mdhm(last.fxInfo.as_of)})`
      : `기간 ${from} ~ ${to} · ${entries.length}개 시점 (${stamps.join(', ')}) · 이력은 당시 가격·환율·자산군·계좌명 기준, 증권사·계좌종류는 지금 계좌 정보`;
    const HEAD = ['계좌명', '증권사', '계좌종류', '구분', '종목명', '심볼', '거래소', '자산군', '표시 통화',
      '수량', '평균매입가(원본)', '매입환율', '현재가(원본)', '현재가 기준시각', '현재가 출처',
      '평가금액', '투자금액', '손익', '가격손익(₩)', '환차손익(₩)', '수익률(%)', '원화 기준 수익률(%)', '전체 대비 비중(%)'];
    const C = { cur: 8, ap: 10, cp: 12, val: 15, inv: 16, prof: 17 };

    function sheet(mode, title) {
      const note = { KRW: '모든 금액을 원화(₩)로 환산 · 손익은 환차손익 포함', USD: '원화 환산 금액을 그 시점 환율로 나눈 달러($) · 수익률은 원화 기준과 같음', MIXED: '원화 종목은 ₩, 달러 종목은 원래 통화 $ (환차손익 제외) · 전체 합계는 통화별로 나눠 표시' }[mode];
      const out = [[`[${title}] ${note}`], [info], ['기준시각', ...HEAD]];
      entries.forEach(e => {
        const model = e.model, total = model.total.valK;
        model.accounts.forEach(acc => {
          const ai = e.acc(acc);
          acc.rows.forEach(x => {
            const i = x.inst, r = x.r, isUSD = i.currency === 'USD', isCash = i.asset_type === 'CASH';
            const v = Calc.view(Calc.add(Calc.emptyAgg(), r), mode, model.fx), p = v.parts[0];
            const priceAt = e.priceAt || (x.priceMeta ? Fmt.mdhm(x.priceMeta.as_of) : '');
            out.push([e.stamp, acc.name, ai.broker, ai.type, '종목', i.name, i.symbol, i.exchange,
              x.unassigned ? '기타종목(미지정)' : Groups.name(x.group), curLabel(p.cur),
              r.q, isCash ? '' : r.ap, isUSD ? r.fxBuy : '', isCash || x.noPrice ? '' : r.cp,
              isCash ? '' : priceAt, e.src(x),
              money(p.val, p.cur), money(p.inv, p.cur), money(p.prof, p.cur),
              v.split ? Math.round(v.split.priceP) : '', v.split ? Math.round(v.split.fxP) : '',
              r2(p.ret), v.refRetK != null ? r2(v.refRetK) : '', r2(pct(r.valK, total))]);
          });
        });
        const tv = Calc.view(model.total, mode, model.fx);
        tv.parts.forEach(p => out.push([e.stamp, '전체 합계', '', '', '전체 합계', '', '', '', '', curLabel(p.cur), '', '', '', '', '', '',
          money(p.val, p.cur), money(p.inv, p.cur), money(p.prof, p.cur),
          tv.split ? Math.round(tv.split.priceP) : '', tv.split ? Math.round(tv.split.fxP) : '', r2(p.ret), '', total ? 100 : 0]));
      });
      return out;
    }
    // 셀 형식: 금액 칸은 그 행의 표시 통화(₩ 정수 / $ 소수 2자리), 단가는 종목 통화 (기준시각 열 다음부터 계산)
    const F = UI.XF;
    const fmt = (row, c) => {
      if (row[3] !== '종목' && row[3] !== '전체 합계') return null;
      if (c === C.val || c === C.inv || c === C.prof) return row[C.cur] === 'USD($)' ? F.usd : F.krw;
      if (c === C.ap || c === C.cp) return typeof row[11] === 'number' ? F.usd : F.krw; // 매입환율이 있으면 달러 종목
      if (c === 9) return Number.isInteger(row[9]) ? F.krw : F.qty; // 정수 수량은 소수점 없이
      if (c === 11) return F.fx;
      if (c === 18 || c === 19) return F.krw;
      if (c >= 20) return F.pct;
      return null;
    };
    const formatFn = (row, c) => (c === 0 ? null : fmt(row.slice(1), c - 1));
    const widths = [16, 14, 12, 10, 9, 28, 11, 9, 14, 9, 14, 14, 10, 14, 13, 14, 15, 15, 14, 14, 13, 10, 13, 12];
    const name = current && !snaps.length ? stamps[0] : `${from.replace(/-/g, '')}-${to.replace(/-/g, '')}`;
    UI.downloadXlsx(`myAsset_계좌현황_${name}.xlsx`, [
      { name: '원화환산', rows: sheet('KRW', '원화환산'), widths, formatFn },
      { name: '달러환산', rows: sheet('USD', '달러환산'), widths, formatFn },
      { name: '통화별', rows: sheet('MIXED', '통화별'), widths, formatFn }
    ]);
  }

  App.init('accounts', render);
})();
