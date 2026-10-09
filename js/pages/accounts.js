// 계좌 현황 (accounts.html) — 계좌 → 보유 종목 트리, 조회 전용
// 계좌·보유 수정, 엑셀 업로드는 계좌/자산관리(manage.html) 화면에서 합니다.
(function () {
  const st = { filterGroup: 'ALL', sortBy: 'default', collapsed: new Set() };
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
        <div class="toolbar"><button type="button" class="btn" id="btn-xlsx" title="보유 내역·계좌 요약을 엑셀 파일로 내려받습니다">엑셀 다운로드</button></div>
      </div>
      ${App.statusBar(status)}
      <div class="sec">${UI.totalsCards(model.total, mode, model.fx)}</div>
      <div class="sec">
        ${UI.treeSection(model, mode, st, { editable: false, showUpdated: true })}
        <p class="small muted">자산군을 클릭하면 자산군 현황의 해당 위치로 이동합니다.
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

  // 엑셀: 보유 내역(원본통화·원화 모두) / 계좌 요약 / 기준정보
  async function exportXlsx() {
    const { model, status, fxInfo } = last;
    const ps = await DataService.getPriceStatus();
    const total = model.total.valK;
    const SRC = { GOOGLE: 'Google Finance', NAVER: '네이버 금융', UPBIT: '업비트', GOLD: '국제 금시세 환산', MOCK: '예시 가격' };
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const r2 = v => Math.round(v * 100) / 100;

    const detail = [[
      '계좌명', '증권사', '계좌종류', '종목명', '심볼', '거래소', '자산군', '통화',
      '수량', '평균매입가(원본)', '매입환율', '현재가(원본)', '현재가 기준시각', '현재가 출처',
      '평가금액(원본)', '투자금액(원본)', '손익(원본)', '수익률(원본,%)',
      '평가금액(₩)', '투자금액(₩)', '손익(₩)', '가격손익(₩)', '환차손익(₩)', '수익률(₩,%)',
      '계좌 내 비중(%)', '전체 대비 비중(%)', '최종 수정'
    ]];
    const summary = [['계좌명', '증권사', '계좌종류', '비고', '종목 수', '평가금액(₩)', '투자금액(₩)', '손익(₩)', '가격손익(₩)', '환차손익(₩)', '수익률(%)', '전체 대비 비중(%)']];
    model.accounts.forEach(acc => {
      const a = acc.account || {};
      acc.rows.forEach(x => {
        const i = x.inst, r = x.r, isUSD = i.currency === 'USD', isCash = i.asset_type === 'CASH', pm = x.priceMeta;
        detail.push([
          acc.name, acc.broker || '', a.account_type || '', i.name, i.symbol, i.exchange,
          x.unassigned ? '기타종목(미지정)' : Groups.name(x.group), i.currency,
          r.q, isCash ? '' : r.ap, isUSD ? r.fxBuy : '', isCash || x.noPrice ? '' : r.cp,
          pm ? Fmt.mdhm(pm.as_of) : '', pm ? (SRC[pm.source] || pm.source) : (isCash ? '현금' : ''),
          r2(r.valO), r2(r.invO), r2(r.profO), r2(r.retO),
          Math.round(r.valK), Math.round(r.invK), Math.round(r.profK), Math.round(r.priceP), Math.round(r.fxP), r2(r.retK),
          r2(pct(r.valK, acc.agg.valK)), r2(pct(r.valK, total)),
          x.holding ? Fmt.mdhm(x.holding.updated_at) : ''
        ]);
      });
      const g = acc.agg;
      summary.push([acc.name, acc.broker || '', a.account_type || '', a.memo || '', acc.rows.length,
        Math.round(g.valK), Math.round(g.invK), Math.round(g.profK), Math.round(g.priceP), Math.round(g.fxP), r2(pct(g.profK, g.invK)), r2(pct(g.valK, total))]);
    });
    const t = model.total;
    summary.push(['전체 합계', '', '', '', t.n, Math.round(t.valK), Math.round(t.invK), Math.round(t.profK), Math.round(t.priceP), Math.round(t.fxP), r2(pct(t.profK, t.invK)), 100]);

    const info = [
      ['항목', '값'],
      ['내려받은 시각', Fmt.mdhm(new Date().toISOString()) + ' (KST)'],
      ['현황 기준일', `${status.baseDate} · ${status.baseSource}`],
      ['현재가 기준', ps.latestAsOf ? Fmt.mdhm(ps.latestAsOf) : '예시 가격'],
      ['적용 환율 (USD/KRW)', fxInfo.rate],
      ['환율 기준', `${Fmt.mdhm(fxInfo.as_of)} · ${SRC[fxInfo.source] || fxInfo.source}`],
      ['계산 기준', '원화(₩) 금액 = 원본통화 금액 × 환율 (투자금액은 매입환율, 평가금액은 현재 환율). 비중은 원화 기준']
    ];
    const F = UI.XF;
    UI.downloadXlsx(`myAsset_계좌현황_${Fmt.todayKST()}.xlsx`, [
      { name: '보유 내역', rows: detail, widths: [14, 12, 10, 28, 11, 9, 14, 6, 14, 14, 10, 14, 13, 14, 15, 15, 14, 12, 15, 15, 14, 14, 14, 11, 12, 12, 13],
        formats: { 8: F.qty, 9: F.orig, 10: F.fx, 11: F.orig, 14: F.orig, 15: F.orig, 16: F.orig, 17: F.pct, 18: F.krw, 19: F.krw, 20: F.krw, 21: F.krw, 22: F.krw, 23: F.pct, 24: F.pct, 25: F.pct } },
      { name: '계좌 요약', rows: summary, widths: [14, 12, 10, 30, 8, 15, 15, 14, 14, 14, 11, 14],
        formats: { 5: F.krw, 6: F.krw, 7: F.krw, 8: F.krw, 9: F.krw, 10: F.pct, 11: F.pct } },
      { name: '기준정보', rows: info, widths: [20, 80], formats: { 1: F.fx } }
    ]);
  }

  App.init('accounts', render);
})();
