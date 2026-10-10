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
    main.querySelector('#btn-xlsx').onclick = exportXlsx;

    if (pendingHash) {
      const row = main.querySelector(`[data-acc="${CSS.escape(pendingHash)}"]`);
      pendingHash = '';
      if (row) row.scrollIntoView({ block: 'center' });
    }
  }

  // 엑셀: 화면의 통화 버튼과 관계없이 3개 탭(원화환산 / 달러환산 / 통화별)을 한 파일로 — PC 백업용
  // 각 탭 = 1행 설명 + 2행 기준정보 + 머리글 → 종목 행(계좌 순) … → 맨 아래 전체 합계
  // 맨 왼쪽 열 '기준시각' = 현재가 기준 시각(KST) YYYYMMDDHHmmss (텍스트) — 언제 데이터인지 바로 알 수 있게
  async function exportXlsx() {
    const { model, status, fxInfo } = last;
    const ps = await DataService.getPriceStatus();
    const total = model.total.valK;
    const SRC = { GOOGLE: 'Google Finance', NAVER: '네이버 금융', UPBIT: '업비트', GOLD: '국제 금시세 환산', MANUAL: '직접 입력', MOCK: '예시 가격' };
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const r2 = v => Math.round(v * 100) / 100;
    const money = (v, cur) => (cur === 'USD' ? r2(v) : Math.round(v));
    const curLabel = c => (c === 'USD' ? 'USD($)' : 'KRW(₩)');
    // 기준시각 = 현재가 기준 시각 (현재가가 아직 없으면 내려받은 시각), KST
    const base = ps.latestAsOf ? new Date(ps.latestAsOf) : new Date();
    const k = new Date(base.getTime() + 9 * 3600 * 1000).toISOString();
    const stamp = k.slice(0, 4) + k.slice(5, 7) + k.slice(8, 10) + k.slice(11, 13) + k.slice(14, 16) + k.slice(17, 19);
    const info = `기준시각 ${stamp} (${ps.latestAsOf ? '현재가 기준 시각' : '현재가가 없어 내려받은 시각'}, KST) · 현황 기준일 ${status.baseDate} (${status.baseSource}) · 현재가 기준 ${ps.latestAsOf ? Fmt.mdhm(ps.latestAsOf) : '예시 가격'} · 적용 환율 ₩${fxInfo.rate} (${Fmt.mdhm(fxInfo.as_of)})`;
    const HEAD = ['계좌명', '증권사', '계좌종류', '구분', '종목명', '심볼', '거래소', '자산군', '표시 통화',
      '수량', '평균매입가(원본)', '매입환율', '현재가(원본)', '현재가 기준시각', '현재가 출처',
      '평가금액', '투자금액', '손익', '가격손익(₩)', '환차손익(₩)', '수익률(%)', '원화 기준 수익률(%)', '전체 대비 비중(%)'];
    const C = { cur: 8, ap: 10, cp: 12, val: 15, inv: 16, prof: 17 };

    function sheet(mode, title) {
      const note = { KRW: '모든 금액을 원화(₩)로 환산 · 손익은 환차손익 포함', USD: '원화 환산 금액을 현재 환율로 나눈 달러($) · 수익률은 원화 기준과 같음', MIXED: '원화 종목은 ₩, 달러 종목은 원래 통화 $ (환차손익 제외) · 전체 합계는 통화별로 나눠 표시' }[mode];
      const rows = [HEAD];
      model.accounts.forEach(acc => {
        const a = acc.account || {};
        acc.rows.forEach(x => {
          const i = x.inst, r = x.r, isUSD = i.currency === 'USD', isCash = i.asset_type === 'CASH', pm = x.priceMeta;
          const v = Calc.view(Calc.add(Calc.emptyAgg(), r), mode, model.fx), p = v.parts[0];
          rows.push([acc.name, acc.broker || '', a.account_type || '', '종목', i.name, i.symbol, i.exchange,
            x.unassigned ? '기타종목(미지정)' : Groups.name(x.group), curLabel(p.cur),
            r.q, isCash ? '' : r.ap, isUSD ? r.fxBuy : '', isCash || x.noPrice ? '' : r.cp,
            pm ? Fmt.mdhm(pm.as_of) : '', pm ? (SRC[pm.source] || pm.source) : (isCash ? '현금' : ''),
            money(p.val, p.cur), money(p.inv, p.cur), money(p.prof, p.cur),
            v.split ? Math.round(v.split.priceP) : '', v.split ? Math.round(v.split.fxP) : '',
            r2(p.ret), v.refRetK != null ? r2(v.refRetK) : '', r2(pct(r.valK, total))]);
        });
      });
      const tv = Calc.view(model.total, mode, model.fx);
      tv.parts.forEach(p => rows.push(['전체 합계', '', '', '전체 합계', '', '', '', '', curLabel(p.cur), '', '', '', '', '', '',
        money(p.val, p.cur), money(p.inv, p.cur), money(p.prof, p.cur),
        tv.split ? Math.round(tv.split.priceP) : '', tv.split ? Math.round(tv.split.fxP) : '', r2(p.ret), '', total ? 100 : 0]));
      // 맨 왼쪽에 기준시각 열 (머리글은 '기준시각')
      return [[`[${title}] ${note}`], [info], ...rows.map((r, idx) => [idx === 0 ? '기준시각' : stamp, ...r])];
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
    UI.downloadXlsx(`myAsset_계좌현황_${stamp}.xlsx`, [
      { name: '원화환산', rows: sheet('KRW', '원화환산'), widths, formatFn },
      { name: '달러환산', rows: sheet('USD', '달러환산'), widths, formatFn },
      { name: '통화별', rows: sheet('MIXED', '통화별'), widths, formatFn }
    ]);
  }

  App.init('accounts', render);
})();
