// 여러 화면에서 함께 쓰는 표·카드 렌더러
window.UI = (function () {
  const charts = {};

  // ---- 금액/손익/수익률 셀 (통화 모드별 parts 를 줄 단위로 표시) ----
  const cur = p => (App.mode === 'MIXED' ? (p.cur === 'KRW' ? '<span class="cur-tag">한국</span>' : '<span class="cur-tag">미국</span>') : '');
  function amt(v, key) {
    return v.parts.map(p => `<div class="ln">${v.parts.length > 1 ? cur(p) : ''}${Fmt.money(p[key], p.cur)}</div>`).join('');
  }
  function prof(v, { split = true } = {}) {
    let h = v.parts.map(p => `<div class="ln ${Fmt.cls(p.prof, p.cur)}">${v.parts.length > 1 ? cur(p) : ''}${Fmt.signedMoney(p.prof, p.cur)}</div>`).join('');
    if (split && v.split) {
      h += `<div class="sub">가격 <span class="${Fmt.cls(v.split.priceP, 'KRW')}">${Fmt.signedMoney(v.split.priceP, 'KRW')}</span></div><div class="sub">환차 <span class="${Fmt.cls(v.split.fxP, 'KRW')}">${Fmt.signedMoney(v.split.fxP, 'KRW')}</span></div>`;
    }
    return h;
  }
  function ret(v, { split = false } = {}) {
    let h = v.parts.map(p => `<div class="ln ${Fmt.cls(p.ret, 'PCT')}">${Fmt.pct(p.ret)}</div>`).join('');
    if (v.refRetK != null) h += `<div class="sub" title="원화 기준 수익률 (환차손익 포함)">원화 <span class="${Fmt.cls(v.refRetK, 'PCT')}">${Fmt.pct(v.refRetK)}</span></div>`;
    if (split && v.split) {
      const inv = v.parts[0].inv, rp = Calc.pct(v.split.priceP, inv), rf = Calc.pct(v.split.fxP, inv);
      h += `<div class="sub">가격 <span class="${Fmt.cls(rp, 'PCT')}">${Fmt.pct(rp)}</span></div><div class="sub">환차 <span class="${Fmt.cls(rf, 'PCT')}">${Fmt.pct(rf)}</span></div>`;
    }
    return h;
  }
  function weight(w, bar = true) {
    if (!bar) return Fmt.weight(w || 0);
    const x = Math.max(0, Math.min(100, w || 0));
    return `<div class="wcell"><span class="wbar"><i style="width:${x}%"></i></span><span>${Fmt.weight(w || 0)}</span></div>`;
  }
  const w = (part, whole) => (whole ? (part / whole) * 100 : 0);

  // 현재가 칸: 마우스를 올리면 기준 시각·출처, 예시(Mock) 가격이면 [예시] 표시
  const SRC = { GOOGLE: 'Google Finance', NAVER: '네이버 금융', UPBIT: '업비트', GOLD: '국제 금시세 × 환율', MANUAL: '직접 입력', MOCK: '예시 가격(Mock)' };
  function priceCell(cp, inst, meta, noPrice) {
    if (inst.asset_type === 'CASH' || noPrice) return '<span class="muted">—</span>';
    if (!meta) return Fmt.price(cp, inst.currency);
    const title = `${SRC[meta.source] || meta.source} · ${Fmt.mdhm(meta.as_of)} 기준`;
    return `<span class="price-cell" title="${esc(title)}">${Fmt.price(cp, inst.currency)}</span>${meta.source === 'MOCK' ? '<span class="tag-mock" title="실제 시세가 아닌 예시 가격">예시</span>' : meta.source === 'MANUAL' ? '<span class="tag-mock" title="직접 입력한 현재가">직접</span>' : ''}<div class="sub">${Fmt.mdhm(meta.as_of)}</div>`;
  }

  // 자산군 표시 (계좌 관리 화면: 읽기 전용, 클릭 시 자산군 현황으로 이동)
  function groupBadge(code, unassigned, { link = true } = {}) {
    const tag = link ? 'a' : 'span';
    if (unassigned) {
      return `<${tag} class="gbadge unassigned" ${link ? 'href="groups.html#OTHER_STOCK"' : ''} title="자산군 미지정 — 기타종목으로 집계됩니다">기타종목<small>미지정</small></${tag}>`;
    }
    return `<${tag} class="gbadge" style="--c:${Groups.color(code)}" ${link ? `href="groups.html#${code}"` : ''} title="자산군 현황에서 보기">${Groups.name(code)}</${tag}>`;
  }

  // ---- 총합 카드 (10항) ----
  function totalsCards(agg, mode, fx, { title = '' } = {}) {
    const v = Calc.view(agg, mode, fx);
    const lbl = p => (mode === 'MIXED' ? `<span class="lbl">${p.cur === 'KRW' ? '한국자산 총합' : '미국자산 총합'}</span>` : '');
    const lines = (fn) => v.parts.map(p => `<div class="stat-v">${lbl(p)}${fn(p)}</div>`).join('');
    const split = v.split ? `<div class="stat-sub">가격손익 <span class="${Fmt.cls(v.split.priceP, 'KRW')}">${Fmt.signedMoney(v.split.priceP, 'KRW')}</span> · 환차손익 <span class="${Fmt.cls(v.split.fxP, 'KRW')}">${Fmt.signedMoney(v.split.fxP, 'KRW')}</span></div>` : '';
    // 수익률 분해: 가격손익·환차손익 ÷ 합계 투자금액 (두 값의 합 = 총 수익률)
    const rp = Calc.pct(agg.priceP, agg.invK), rf = Calc.pct(agg.fxP, agg.invK);
    const retSplit = v.split ? `<div class="stat-sub">가격 <span class="${Fmt.cls(rp, 'PCT')}">${Fmt.pct(rp)}</span> · 환차 <span class="${Fmt.cls(rf, 'PCT')}">${Fmt.pct(rf)}</span></div>` : '';
    const note = mode === 'MIXED' ? '<div class="stat-sub">혼합 모드는 통화별로 나눠 표시합니다 (합산하지 않음)</div>' : '';
    return `${title ? `<h3 class="sec-sub">${title}</h3>` : ''}
      <div class="stats">
        <div class="card stat"><div class="stat-t">총 평가금액</div>${lines(p => Fmt.money(p.val, p.cur))}${note}</div>
        <div class="card stat"><div class="stat-t">총 투자금액</div>${lines(p => Fmt.money(p.inv, p.cur))}</div>
        <div class="card stat"><div class="stat-t">총 손익</div>${lines(p => `<span class="${Fmt.cls(p.prof, p.cur)}">${Fmt.signedMoney(p.prof, p.cur)}</span>`)}${split}</div>
        <div class="card stat"><div class="stat-t">총 수익률</div>${lines(p => `<span class="${Fmt.cls(p.ret, 'PCT')}">${Fmt.pct(p.ret)}</span>`)}${retSplit}<div class="stat-sub">합계 손익 ÷ 합계 투자금액</div></div>
      </div>`;
  }

  // ---- 자산군별 요약 표 ----
  function groupTable(model, mode, { link = true } = {}) {
    const total = model.total.valK;
    const rows = Groups.list.map(g => {
      const a = model.groups[g.code].agg;
      const v = Calc.view(a, mode, model.fx);
      const name = `<span class="dot" style="background:${g.color}"></span>${link ? `<a href="groups.html#${g.code}">${g.name}</a>` : g.name}`;
      return `<tr><td>${name}</td><td class="num">${amt(v, 'val')}</td><td class="num">${amt(v, 'inv')}</td><td class="num">${prof(v)}</td><td class="num">${ret(v)}</td><td class="num">${weight(w(a.valK, total))}</td></tr>`;
    }).join('');
    const tv = Calc.view(model.total, mode, model.fx);
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>자산군</th><th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th><th class="num">전체 대비 비중</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td class="num">${amt(tv, 'val')}</td><td class="num">${amt(tv, 'inv')}</td><td class="num">${prof(tv)}</td><td class="num">${ret(tv)}</td><td class="num">${weight(model.total.valK ? 100 : 0)}</td></tr></tfoot>
    </table></div>`;
  }

  // ---- 계좌 → 보유 종목 트리 (12-1항). 계좌 관리 화면과 XLSX 업로드 미리보기에서 사용 ----
  function holdingsTree(model, mode, opts = {}) {
    const { editable = false, filterGroup = 'ALL', sortBy = 'default', collapsed = new Set(), showUpdated = editable, linkGroups = true, byBroker = false } = opts;
    // showUpdated: 종목명 아래 '최종 수정' 표시 / linkGroups: 자산군 클릭 시 자산군 현황으로 이동
    // groupBy: 계좌를 묶는 기준 'broker'(증권사) · 'type'(계좌종류) · 'name'(계좌명) · 없음. byBroker: true = 'broker'
    const groupBy = opts.groupBy || (byBroker ? 'broker' : null);
    const GROUP_KEY = {
      broker: a => a.broker || '(증권사 없음)',
      type: a => (a.account && a.account.account_type) || '(계좌종류 없음)',
      name: a => a.name
    }[groupBy];
    const total = model.total.valK;
    const groupIdx = c => Groups.codes.indexOf(c);
    const match = x => filterGroup === 'ALL' || (filterGroup === 'UNASSIGNED' ? x.unassigned : (x.group === filterGroup && !x.unassigned) || (filterGroup === 'OTHER_STOCK' && x.unassigned));
    const sortRows = rows => {
      const list = rows.slice();
      if (sortBy === 'group') list.sort((a, b) => groupIdx(a.group) - groupIdx(b.group) || (a.unassigned - b.unassigned) || b.r.valK - a.r.valK);
      else if (sortBy === 'group-desc') list.sort((a, b) => groupIdx(b.group) - groupIdx(a.group) || b.r.valK - a.r.valK);
      else if (sortBy === 'value') list.sort((a, b) => b.r.valK - a.r.valK);
      return list;
    };
    const cols = 12 + (editable ? 1 : 0);
    const sortMark = sortBy === 'group' ? ' ▲' : sortBy === 'group-desc' ? ' ▼' : '';
    let body = '';
    let accounts = model.accounts;
    const brokerAgg = {};
    if (GROUP_KEY) {
      const order = [];
      accounts.forEach(a => { const b = GROUP_KEY(a); if (!brokerAgg[b]) { brokerAgg[b] = { agg: Calc.emptyAgg(), n: 0 }; order.push(b); } a.rows.forEach(x => Calc.add(brokerAgg[b].agg, x.r)); brokerAgg[b].n++; });
      accounts = order.flatMap(b => accounts.filter(a => GROUP_KEY(a) === b));
    }
    let lastBroker = null;
    accounts.forEach(acc => {
      const bk = GROUP_KEY ? GROUP_KEY(acc) : null;
      if (GROUP_KEY && bk !== lastBroker) {
        lastBroker = bk;
        const bv = Calc.view(brokerAgg[bk].agg, mode, model.fx);
        body += `<tr class="broker-row"><td colspan="7"><b>${esc(bk)}</b> <span class="muted">· ${brokerAgg[bk].n}개 계좌</span></td>
          <td class="num">${amt(bv, 'val')}</td><td class="num">${amt(bv, 'inv')}</td><td class="num">${prof(bv, { split: false })}</td><td class="num">${ret(bv)}</td>
          <td class="num">${weight(w(brokerAgg[bk].agg.valK, total), false)}</td>${editable ? '<td></td>' : ''}</tr>`;
      }
      const av = Calc.view(acc.agg, mode, model.fx);
      const isCol = collapsed.has(acc.key);
      const rows = sortRows(acc.rows.filter(match));
      body += `<tr class="acc-row" data-acc="${esc(acc.key)}">
        <td colspan="3"><button type="button" class="tg" data-toggle-acc="${esc(acc.key)}" aria-label="접기/펼치기">${isCol ? '▸' : '▾'}</button>
          <b>${esc(acc.name)}</b>${acc.account && acc.account.account_type ? ` <span class="tag acc-type">${esc(acc.account.account_type)}</span>` : ''} <span class="muted">${esc(acc.broker || '')} · ${acc.rows.length}종목</span>${editable ? `
          <button type="button" class="btn btn-sm btn-ghost" data-act="edit-account" data-id="${esc(acc.id)}">수정</button><button type="button" class="btn btn-sm btn-ghost btn-ghost-danger" data-act="delete-account" data-id="${esc(acc.id)}">삭제</button>` : ''}${acc.account && acc.account.memo ? `<div class="acc-memo" title="비고">${esc(acc.account.memo)}</div>` : ''}</td>
        <td colspan="4" class="muted small">계좌 소계</td>
        <td class="num">${amt(av, 'val')}</td><td class="num">${amt(av, 'inv')}</td><td class="num">${prof(av)}</td><td class="num">${ret(av, { split: true })}</td>
        <td class="num" title="전체 대비 비중">${weight(w(acc.agg.valK, total), false)}</td>
        ${editable ? `<td class="actions">
          <button type="button" class="btn btn-sm btn-primary" data-act="add-holding" data-id="${esc(acc.id)}" title="이 계좌에 종목 추가">+ 종목</button></td>` : ''}
      </tr>`;
      if (isCol) return;
      if (!rows.length) {
        body += `<tr class="h-row empty"><td colspan="${cols}" class="muted">${acc.rows.length ? '필터 조건에 맞는 종목이 없습니다' : '보유 종목이 없습니다'}</td></tr>`;
        return;
      }
      rows.forEach(x => {
        const v = Calc.view(Calc.add(Calc.emptyAgg(), x.r), mode, model.fx);
        const i = x.inst, isCash = i.asset_type === 'CASH', isUSD = i.currency === 'USD';
        const h = x.holding || x.item;
        body += `<tr class="h-row">
          <td class="nm">${esc(i.name)}${x.noPrice ? ' <span class="tag-warn" title="Mock 현재가가 없어 평균매입가로 계산합니다">가격없음</span>' : ''}${showUpdated ? `<div class="sub upd">최종 수정 ${Fmt.mdhm(h.updated_at)}</div>` : ''}</td>
          <td class="sym">${esc(i.symbol)}<small>${esc(i.exchange)}</small></td>
          <td>${groupBadge(x.group, x.unassigned, { link: linkGroups })}</td>
          <td class="num">${Fmt.qty(x.r.q, i)}</td>
          <td class="num">${isCash ? '<span class="muted">—</span>' : Fmt.price(x.r.ap, i.currency)}</td>
          <td class="num">${isUSD ? Fmt.fx(x.r.fxBuy) : '<span class="muted">—</span>'}</td>
          <td class="num">${priceCell(x.r.cp, i, x.priceMeta, x.noPrice)}</td>
          <td class="num">${amt(v, 'val')}</td><td class="num">${amt(v, 'inv')}</td><td class="num">${prof(v)}</td><td class="num">${ret(v, { split: true })}</td>
          <td class="num" title="계좌 내 비중">${weight(w(x.r.valK, acc.agg.valK), false)}</td>
          ${editable ? `<td class="actions">
            <button type="button" class="btn btn-sm" data-act="edit-holding" data-id="${esc(h.id)}">수정</button>
            <button type="button" class="btn btn-sm btn-ghost-danger" data-act="delete-holding" data-id="${esc(h.id)}">삭제</button></td>` : ''}
        </tr>`;
      });
    });
    if (!model.accounts.length) body = `<tr><td colspan="${cols}" class="muted center">계좌가 없습니다.</td></tr>`;
    const tv = Calc.view(model.total, mode, model.fx);
    return `<div class="tbl-wrap tree-wrap"><table class="tbl tree">
      <thead><tr>
        <th>종목명</th><th>심볼</th>
        <th><button type="button" class="th-sort" data-sort-group title="자산군 순으로 정렬">자산군${sortMark}</button></th>
        <th class="num">수량</th><th class="num">평균매입가</th><th class="num">매입환율</th><th class="num">현재가</th>
        <th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th>
        <th class="num" title="계좌 행: 전체 대비 / 종목 행: 계좌 내">비중</th>
        ${editable ? '<th>관리</th>' : ''}
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="7">전체 합계</td><td class="num">${amt(tv, 'val')}</td><td class="num">${amt(tv, 'inv')}</td><td class="num">${prof(tv)}</td><td class="num">${ret(tv, { split: true })}</td><td class="num">${weight(total ? 100 : 0, false)}</td>${editable ? '<td></td>' : ''}</tr></tfoot>
    </table></div>`;
  }

  // ---- 계좌 트리 + 필터·정렬·접기 (계좌 현황 / 계좌 관리 공용) ----
  // st = { filterGroup, sortBy, collapsed:Set } 화면별 상태 객체
  function treeSection(model, mode, st, opts = {}) {
    const { filterGroup, sortBy } = st;
    return `
      <div class="sec-hd">
        <div class="toolbar">
          <label class="small muted" for="f-group">자산군 필터</label>
          <select id="f-group" class="inline">
            <option value="ALL">전체</option>
            ${Groups.list.map(g => `<option value="${g.code}" ${filterGroup === g.code ? 'selected' : ''}>${g.name}${g.code === 'OTHER_STOCK' ? ' (미지정 포함)' : ''}</option>`).join('')}
            <option value="UNASSIGNED" ${filterGroup === 'UNASSIGNED' ? 'selected' : ''}>미지정만</option>
          </select>
          <label class="small muted" for="f-sort">정렬</label>
          <select id="f-sort" class="inline">
            <option value="default" ${sortBy === 'default' ? 'selected' : ''}>등록순</option>
            <option value="group" ${sortBy === 'group' ? 'selected' : ''}>자산군순</option>
            <option value="group-desc" ${sortBy === 'group-desc' ? 'selected' : ''}>자산군 역순</option>
            <option value="value" ${sortBy === 'value' ? 'selected' : ''}>평가금액 큰 순</option>
          </select>
          ${opts.groupSelect ? `<label class="small muted" for="f-groupby">묶기 기준</label>
          <select id="f-groupby" class="inline">
            ${[['broker', '증권사'], ['type', '계좌종류'], ['name', '계좌명']].map(([k, l]) => `<option value="${k}" ${st.groupBy === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>` : ''}
          ${opts.extraTools || ''}
        </div>
        <div class="toolbar"><button type="button" class="btn btn-sm" id="exp-all">모두 펼치기</button><button type="button" class="btn btn-sm" id="col-all">모두 접기</button></div>
      </div>
      ${filterGroup !== 'ALL' ? '<div class="notice info">자산군 필터 적용 중입니다. 계좌 소계는 계좌 전체 기준입니다.</div>' : ''}
      ${holdingsTree(model, mode, { ...opts, filterGroup, sortBy, collapsed: st.collapsed, ...(opts.groupSelect ? { groupBy: st.groupBy } : {}) })}`;
  }
  function bindTree(root, model, st) {
    const gb = root.querySelector('#f-groupby');
    if (gb) gb.onchange = e => { st.groupBy = e.target.value; if (st.onGroupBy) st.onGroupBy(st.groupBy); App.rerender(); };
    root.querySelector('#f-group').onchange = e => { st.filterGroup = e.target.value; App.rerender(); };
    root.querySelector('#f-sort').onchange = e => { st.sortBy = e.target.value; App.rerender(); };
    root.querySelector('#exp-all').onclick = () => { st.collapsed.clear(); App.rerender(); };
    root.querySelector('#col-all').onclick = () => { model.accounts.forEach(a => st.collapsed.add(a.key)); App.rerender(); };
    const sg = root.querySelector('[data-sort-group]');
    if (sg) sg.onclick = () => { st.sortBy = st.sortBy === 'group' ? 'group-desc' : st.sortBy === 'group-desc' ? 'default' : 'group'; App.rerender(); };
    root.querySelectorAll('[data-toggle-acc]').forEach(b => b.onclick = () => {
      const k = b.dataset.toggleAcc; st.collapsed.has(k) ? st.collapsed.delete(k) : st.collapsed.add(k); App.rerender();
    });
    fitTree();
  }
  // 표 높이를 '첫 화면의 남은 높이'에 맞춰, 아래로 스크롤하지 않아도 가로 스크롤바가 보이게 합니다.
  function fitTree() {
    const wrap = document.querySelector('#main .tree-wrap');
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    wrap.style.maxHeight = Math.max(360, window.innerHeight - top - 16) + 'px';
  }
  window.addEventListener('resize', fitTree);

  // ---- 자산 현황 표 (이력 '날짜별 자산 현황'·자산군 현황 '현재 자산 현황' 공용) ----
  // entries: [{ label: '2026-10-09', sub: '08:00', tag: '', model }]  (model = Calc.buildModel / buildSnapshotModel 결과)
  // 총 평가·투자·손익·수익률·환율 + 자산군별 총액 7칸 → 자산군별 비중 7칸.
  // 혼합 모드는 줄마다 원화 줄 + 달러 줄 (비중은 그 통화 자산 안에서)
  function statusTable(entries, mode, { firstHeader = '날짜', empty = '데이터가 없습니다', wrapClass = 'hist-wrap' } = {}) {
    const mixed = mode === 'MIXED';
    const gcell = (i, html) => `<td class="num${i === 0 ? ' g-first' : ''}">${html}</td>`;
    const labelCell = (e, span) => `<td class="nowrap sticky-col"${span ? ` rowspan="${span}"` : ''}>${esc(e.label)}${e.sub ? ` <span class="muted small">${esc(e.sub)}</span>` : ''}${e.tag ? ` <span class="tag">${esc(e.tag)}</span>` : ''}</td>`;
    const rows = entries.map(e => {
      const m = e.model;
      if (!mixed) {
        const v = Calc.view(m.total, mode, m.fx);
        const amounts = Groups.list.map((g, i) => gcell(i, amt(Calc.view(m.groups[g.code].agg, mode, m.fx), 'val'))).join('');
        const weights = Groups.list.map((g, i) => gcell(i, Fmt.weight(w(m.groups[g.code].agg.valK, m.total.valK)))).join('');
        return `<tr>${labelCell(e)}
          <td class="num">${amt(v, 'val')}</td><td class="num">${amt(v, 'inv')}</td><td class="num">${prof(v, { split: false })}</td><td class="num">${ret(v)}</td>
          <td class="num">${Fmt.fx(m.fx || 0)}</td>${amounts}${weights}</tr>`;
      }
      return [['KRW', '원화', 'kr'], ['USD', '달러', 'us']].map(([cur, label, k], idx) => {
        const t = m.total[k], p = t.val - t.inv, r = Calc.pct(p, t.inv);
        const has = a => (k === 'kr' ? a.nKR : a.nUS);
        const amounts = Groups.list.map((g, i) => { const a = m.groups[g.code].agg; return gcell(i, has(a) ? Fmt.money(a[k].val, cur) : '<span class="muted">—</span>'); }).join('');
        const weights = Groups.list.map((g, i) => { const a = m.groups[g.code].agg; return gcell(i, has(a) ? Fmt.weight(w(a[k].val, t.val)) : '<span class="muted">—</span>'); }).join('');
        return `<tr class="${idx === 0 ? 'pair-top' : 'pair-bottom'}">${idx === 0 ? labelCell(e, 2) : ''}
          <td class="cur-col">${label}</td>
          <td class="num">${Fmt.money(t.val, cur)}</td><td class="num">${Fmt.money(t.inv, cur)}</td>
          <td class="num ${Fmt.cls(p, cur)}">${Fmt.signedMoney(p, cur)}</td><td class="num ${Fmt.cls(r, 'PCT')}">${Fmt.pct(r)}</td>
          ${idx === 0 ? `<td class="num" rowspan="2">${Fmt.fx(m.fx || 0)}</td>` : ''}${amounts}${weights}</tr>`;
      }).join('');
    }).join('');
    return `<div class="tbl-wrap ${wrapClass}"><table class="tbl hist">
      <thead>
        <tr>
          <th rowspan="2" class="sticky-col">${firstHeader}</th>${mixed ? '<th rowspan="2">통화</th>' : ''}<th rowspan="2" class="num">총 평가금액</th><th rowspan="2" class="num">총 투자금액</th>
          <th rowspan="2" class="num">총 손익</th><th rowspan="2" class="num">총 수익률</th><th rowspan="2" class="num">환율</th>
          <th colspan="${Groups.list.length}" class="center g-first">자산군별 총액</th>
          <th colspan="${Groups.list.length}" class="center g-first">자산군별 비중 <span class="muted">${mixed ? '(통화별 자산 안에서)' : '(원화 환산 기준)'}</span></th>
        </tr>
        <tr>${[0, 1].map(() => Groups.list.map((g, i) => `<th class="num${i === 0 ? ' g-first' : ''}"><span class="dot" style="background:${g.color}"></span>${g.name}</th>`).join('')).join('')}</tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="${(mixed ? 7 : 6) + Groups.list.length * 2}" class="muted">${empty}</td></tr>`}</tbody>
    </table></div>`;
  }

  // ---- 화면 데이터를 xlsx 로 내려받기 (SheetJS) ----
  // sheets: [{ name, rows: [[...], ...] (첫 줄 = 제목), widths: [열 너비], formats: { 열번호: '#,##0' } }]
  // 숫자는 숫자 그대로 저장 → 엑셀에서 바로 계산 가능
  function downloadXlsx(fileName, sheets) {
    if (!window.XLSX) { App.toast('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error'); return; }
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => {
      const ws = XLSX.utils.aoa_to_sheet(s.rows);
      if (s.widths) ws['!cols'] = s.widths.map(w => ({ wch: w }));
      // 숫자 형식: formats = { 열번호: 형식 } 또는 formatFn(행 배열, 열번호) → 형식 (통화가 섞인 열은 셀마다 다르게)
      if (s.formats || s.formatFn) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let r = 0; r <= range.e.r; r++) {
          for (let c = 0; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell || cell.t !== 'n') continue;
            const z = (s.formatFn && s.formatFn(s.rows[r] || [], c)) || (s.formats && s.formats[c]);
            if (z) cell.z = z;
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, s.name);
    });
    XLSX.writeFile(wb, fileName);
  }
  // 엑셀 숫자 형식
  const XF = { krw: '#,##0', usd: '#,##0.00', orig: '#,##0.##', fx: '#,##0.00', pct: '0.00"%"', qty: '#,##0.0#######' };

  // ---- Chart.js 도우미 (다시 그릴 때 이전 차트 제거) ----
  function chart(canvasId, config) {
    if (charts[canvasId]) charts[canvasId].destroy();
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return null;
    charts[canvasId] = new Chart(el, config);
    return charts[canvasId];
  }
  function moneyTick(c) { return v => (c === 'USD' ? '$' : '₩') + Fmt.plain(Math.abs(v) >= 1e6 && c !== 'USD' ? Math.round(v / 1e4) : v) + (Math.abs(v) >= 1e6 && c !== 'USD' ? '만' : ''); }

  // ---- 종목 검색 (이름/심볼/영문명) → 한 종목 선택 ----
  // 등록된 종목 + 외부 종목 목록(월 1회 갱신)을 함께 검색합니다. 외부 목록 종목을 고르면 종목 마스터에 자동 등록됩니다.
  // 결과: 선택한 종목 객체 / { __new: true } (직접 등록 선택) / null (취소)
  function pickInstrument({ title = '종목 검색', confirmLabel = '선택', allowNew = false, note = '' } = {}) {
    return new Promise(resolve => {
      let selected = null, resolved = false;
      const finish = async (api, val) => {
        resolved = true;
        if (val && !val.__new && !val.id) val = await DataService.ensureInstrument(val);
        api.close(); resolve(val);
      };
      const m = App.modal({
        title, size: 'mid',
        body: `${note ? `<p class="small muted" style="margin-top:0">${note}</p>` : ''}
          <input type="search" id="pick-q" placeholder="이름 / 심볼 / 영문명으로 검색 (예: QQQ, 나스닥, Samsung)" autocomplete="off">
          <div class="search-list" id="pick-list"></div>
          <div class="pick-foot small muted">
            <span>${allowNew ? '상장 종목 목록에도 없나요? <button type="button" class="btn btn-sm" id="pick-new">+ 직접 등록</button>' : ''}</span>
            <span><span id="pick-sync-info"></span> <button type="button" class="btn btn-sm" id="pick-sync" title="전체 상장 종목 목록을 지금 다시 받아오고, 등록된 종목의 이름도 새 이름으로 바꿉니다">↻ 목록 최신화</button></span>
          </div>`,
        onClose: () => { if (!resolved) resolve(null); },
        buttons: [
          { label: '취소' },
          { label: confirmLabel, kind: 'primary', id: 'pick-ok', disabled: true, onClick: api => finish(api, selected) }
        ]
      });
      const list = m.body.querySelector('#pick-list');
      const ok = m.footer.querySelector('#pick-ok');
      let seq = 0, timer = null;
      async function search() {
        const q = m.body.querySelector('#pick-q').value;
        const my = ++seq;
        let items;
        try { items = await DataService.searchCatalog(q); }
        catch (e) { list.innerHTML = `<div class="muted center" style="padding:16px">종목 목록을 불러오지 못했습니다: ${esc(e.message)}</div>`; return; }
        if (my !== seq) return; // 더 최근 검색이 있으면 이 결과는 버림
        const hint = !q.trim() ? '<div class="muted small" style="padding:8px 12px">이름·종목코드·영문명을 입력하면 전체 상장 종목에서 찾습니다. (지금은 등록된 종목만 표시)</div>' : '';
        list.innerHTML = hint + (items.map((i, idx) => `
          <div class="search-item" data-idx="${idx}">
            <div><b>${esc(i.name)}</b> <span class="muted small">${esc(i.eng_name && i.eng_name !== i.name ? i.eng_name : '')}</span>
              <div class="meta">${esc(i.symbol)} · ${esc(i.market || i.exchange)} · ${esc(i.asset_type)} · ${esc(i.currency)}</div></div>
            <div>${i.registered ? groupBadge(Groups.of(i), !i.asset_group, { link: false }) : '<span class="tag" title="전체 상장 종목 목록에서 찾은 종목 — 선택하면 등록됩니다">상장 종목</span>'}</div>
          </div>`).join('') || '<div class="muted center" style="padding:16px">검색 결과가 없습니다</div>');
        list.querySelectorAll('.search-item').forEach(el => {
          const inst = items[+el.dataset.idx];
          el.addEventListener('click', () => {
            selected = inst;
            list.querySelectorAll('.search-item').forEach(x => x.classList.toggle('sel', x === el));
            ok.disabled = false;
          });
          el.addEventListener('dblclick', () => { selected = inst; finish(m, selected); });
        });
      }
      // 입력이 잠시 멈추면 검색 (글자마다 DB 를 조회하지 않도록)
      m.body.querySelector('#pick-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
      const nb = m.body.querySelector('#pick-new');
      if (nb) nb.addEventListener('click', () => finish(m, { __new: true }));
      // 목록 최신화: 외부 목록을 지금 다시 받아오고 새 종목명을 반영한 뒤 검색 결과를 다시 보여 줍니다
      const info = m.body.querySelector('#pick-sync-info');
      const showInfo = async () => {
        const c = await DataService.getCatalogInfo();
        info.textContent = `상장 종목 ${Fmt.plain(c.count)}개 · 갱신 ${c.syncedAt ? Fmt.mdhm(c.syncedAt) : '—'}`;
        info.title = `다음 자동 갱신 ${Fmt.mdhm(c.nextSyncAt)}${c.message ? '\n' + c.message : ''}`;
      };
      m.body.querySelector('#pick-sync').addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = '최신화 중… (최대 1분)';
        try {
          const r = await DataService.syncCatalog();
          App.toast(r.renamed.length ? `목록을 최신화했습니다 (${Fmt.plain(r.count)}개). 종목명 변경 ${r.renamed.length}건: ${r.renamed.map(x => `${x.from} → ${x.to}`).join(', ')}` : `목록을 최신화했습니다 (${Fmt.plain(r.count)}개). 바뀐 종목명은 없습니다.`);
        } catch (err) { App.toast(err.message, 'error'); }
        btn.disabled = false;
        btn.textContent = label;
        await showInfo();
        await search();
      });
      showInfo();
      search();
    });
  }

  return { amt, prof, ret, weight, w, priceCell, statusTable, downloadXlsx, XF, groupBadge, totalsCards, groupTable, holdingsTree, treeSection, bindTree, chart, moneyTick, pickInstrument };
})();
