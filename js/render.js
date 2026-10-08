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
  function ret(v) {
    let h = v.parts.map(p => `<div class="ln ${Fmt.cls(p.ret, 'PCT')}">${Fmt.pct(p.ret)}</div>`).join('');
    if (v.refRetK != null) h += `<div class="sub" title="원화 기준 수익률 (환차손익 포함)">원화 <span class="${Fmt.cls(v.refRetK, 'PCT')}">${Fmt.pct(v.refRetK)}</span></div>`;
    return h;
  }
  function weight(w, bar = true) {
    if (!bar) return Fmt.weight(w || 0);
    const x = Math.max(0, Math.min(100, w || 0));
    return `<div class="wcell"><span class="wbar"><i style="width:${x}%"></i></span><span>${Fmt.weight(w || 0)}</span></div>`;
  }
  const w = (part, whole) => (whole ? (part / whole) * 100 : 0);

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
    const note = mode === 'MIXED' ? '<div class="stat-sub">혼합 모드는 통화별로 나눠 표시합니다 (합산하지 않음)</div>' : '';
    return `${title ? `<h3 class="sec-sub">${title}</h3>` : ''}
      <div class="stats">
        <div class="card stat"><div class="stat-t">총 평가금액</div>${lines(p => Fmt.money(p.val, p.cur))}${note}</div>
        <div class="card stat"><div class="stat-t">총 투자금액</div>${lines(p => Fmt.money(p.inv, p.cur))}</div>
        <div class="card stat"><div class="stat-t">총 손익</div>${lines(p => `<span class="${Fmt.cls(p.prof, p.cur)}">${Fmt.signedMoney(p.prof, p.cur)}</span>`)}${split}</div>
        <div class="card stat"><div class="stat-t">총 수익률</div>${lines(p => `<span class="${Fmt.cls(p.ret, 'PCT')}">${Fmt.pct(p.ret)}</span>`)}<div class="stat-sub">합계 손익 ÷ 합계 투자금액</div></div>
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
    const { editable = false, filterGroup = 'ALL', sortBy = 'default', collapsed = new Set(), showUpdated = editable } = opts; // showUpdated: 종목명 아래 '최종 수정' 표시
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
    model.accounts.forEach(acc => {
      const av = Calc.view(acc.agg, mode, model.fx);
      const isCol = collapsed.has(acc.key);
      const rows = sortRows(acc.rows.filter(match));
      body += `<tr class="acc-row" data-acc="${esc(acc.key)}">
        <td colspan="3"><button type="button" class="tg" data-toggle-acc="${esc(acc.key)}" aria-label="접기/펼치기">${isCol ? '▸' : '▾'}</button>
          <b>${esc(acc.name)}</b> <span class="muted">${esc(acc.broker || '')} · ${acc.rows.length}종목</span>${editable ? `
          <button type="button" class="btn btn-sm btn-ghost" data-act="edit-account" data-id="${esc(acc.id)}">수정</button><button type="button" class="btn btn-sm btn-ghost btn-ghost-danger" data-act="delete-account" data-id="${esc(acc.id)}">삭제</button>` : ''}</td>
        <td colspan="4" class="muted small">계좌 소계</td>
        <td class="num">${amt(av, 'val')}</td><td class="num">${amt(av, 'inv')}</td><td class="num">${prof(av)}</td><td class="num">${ret(av)}</td>
        <td class="num" title="전체 대비 비중">${weight(w(acc.agg.valK, total), false)}</td>
        ${editable ? `<td class="actions">
          <button type="button" class="btn btn-sm btn-primary" data-act="add-holding" data-id="${esc(acc.id)}">종목 추가</button></td>` : ''}
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
          <td>${groupBadge(x.group, x.unassigned, { link: editable })}</td>
          <td class="num">${Fmt.qty(x.r.q, i)}</td>
          <td class="num">${isCash ? '<span class="muted">—</span>' : Fmt.price(x.r.ap, i.currency)}</td>
          <td class="num">${isUSD ? Fmt.fx(x.r.fxBuy) : '<span class="muted">—</span>'}</td>
          <td class="num">${isCash ? '<span class="muted">—</span>' : x.noPrice ? '<span class="muted">—</span>' : Fmt.price(x.r.cp, i.currency)}</td>
          <td class="num">${amt(v, 'val')}</td><td class="num">${amt(v, 'inv')}</td><td class="num">${prof(v)}</td><td class="num">${ret(v)}</td>
          <td class="num" title="계좌 내 비중">${weight(w(x.r.valK, acc.agg.valK), false)}</td>
          ${editable ? `<td class="actions">
            <button type="button" class="btn btn-sm" data-act="edit-holding" data-id="${esc(h.id)}">수정</button>
            <button type="button" class="btn btn-sm btn-ghost-danger" data-act="delete-holding" data-id="${esc(h.id)}">삭제</button></td>` : ''}
        </tr>`;
      });
    });
    if (!model.accounts.length) body = `<tr><td colspan="${cols}" class="muted center">계좌가 없습니다.</td></tr>`;
    const tv = Calc.view(model.total, mode, model.fx);
    return `<div class="tbl-wrap"><table class="tbl tree">
      <thead><tr>
        <th>종목명</th><th>심볼</th>
        <th>${editable ? `<button type="button" class="th-sort" data-sort-group title="자산군 순으로 정렬">자산군${sortMark}</button>` : '자산군'}</th>
        <th class="num">수량</th><th class="num">평균매입가</th><th class="num">매입환율</th><th class="num">현재가</th>
        <th class="num">평가금액</th><th class="num">투자금액</th><th class="num">손익</th><th class="num">수익률</th>
        <th class="num" title="계좌 행: 전체 대비 / 종목 행: 계좌 내">비중</th>
        ${editable ? '<th>관리</th>' : ''}
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="7">전체 합계</td><td class="num">${amt(tv, 'val')}</td><td class="num">${amt(tv, 'inv')}</td><td class="num">${prof(tv)}</td><td class="num">${ret(tv)}</td><td class="num">${weight(total ? 100 : 0)}</td>${editable ? '<td></td>' : ''}</tr></tfoot>
    </table></div>`;
  }

  // ---- Chart.js 도우미 (다시 그릴 때 이전 차트 제거) ----
  function chart(canvasId, config) {
    if (charts[canvasId]) charts[canvasId].destroy();
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return null;
    charts[canvasId] = new Chart(el, config);
    return charts[canvasId];
  }
  function moneyTick(c) { return v => (c === 'USD' ? '$' : '₩') + Fmt.plain(Math.abs(v) >= 1e6 && c !== 'USD' ? Math.round(v / 1e4) : v) + (Math.abs(v) >= 1e6 && c !== 'USD' ? '만' : ''); }

  // ---- 종목 마스터 검색 (이름/심볼/영문명) → 한 종목 선택 ----
  // 결과: 선택한 종목 객체 / { __new: true } (새 종목 등록 선택) / null (취소)
  function pickInstrument({ title = '종목 검색', confirmLabel = '선택', allowNew = false, note = '' } = {}) {
    return new Promise(resolve => {
      let selected = null, resolved = false;
      const finish = (api, val) => { resolved = true; api.close(); resolve(val); };
      const m = App.modal({
        title, size: 'mid',
        body: `${note ? `<p class="small muted" style="margin-top:0">${note}</p>` : ''}
          <input type="search" id="pick-q" placeholder="이름 / 심볼 / 영문명으로 검색 (예: QQQ, 나스닥, Samsung)" autocomplete="off">
          <div class="search-list" id="pick-list"></div>
          ${allowNew ? '<div class="small muted" style="margin-top:10px">검색 결과에 없나요? <button type="button" class="btn btn-sm" id="pick-new">+ 새 종목 등록</button></div>' : ''}`,
        onClose: () => { if (!resolved) resolve(null); },
        buttons: [
          { label: '취소' },
          { label: confirmLabel, kind: 'primary', id: 'pick-ok', disabled: true, onClick: api => finish(api, selected) }
        ]
      });
      const list = m.body.querySelector('#pick-list');
      const ok = m.footer.querySelector('#pick-ok');
      async function search() {
        const items = await DataService.searchInstruments(m.body.querySelector('#pick-q').value);
        list.innerHTML = items.map(i => `
          <div class="search-item ${selected && selected.id === i.id ? 'sel' : ''}" data-id="${esc(i.id)}">
            <div><b>${esc(i.name)}</b> <span class="muted small">${esc(i.eng_name || '')}</span>
              <div class="meta">${esc(i.symbol)} · ${esc(i.exchange)} · ${esc(i.asset_type)} · ${esc(i.currency)}</div></div>
            <div>${groupBadge(Groups.of(i), !i.asset_group, { link: false })}</div>
          </div>`).join('') || '<div class="muted center" style="padding:16px">검색 결과가 없습니다</div>';
        list.querySelectorAll('.search-item').forEach(el => {
          const inst = items.find(x => x.id === el.dataset.id);
          el.addEventListener('click', () => {
            selected = inst;
            list.querySelectorAll('.search-item').forEach(x => x.classList.toggle('sel', x === el));
            ok.disabled = false;
          });
          el.addEventListener('dblclick', () => { selected = inst; finish(m, selected); });
        });
      }
      m.body.querySelector('#pick-q').addEventListener('input', search);
      const nb = m.body.querySelector('#pick-new');
      if (nb) nb.addEventListener('click', () => finish(m, { __new: true }));
      search();
    });
  }

  return { amt, prof, ret, weight, w, groupBadge, totalsCards, groupTable, holdingsTree, chart, moneyTick, pickInstrument };
})();
