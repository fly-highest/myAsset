// =====================================================================
// dataService.js — 모든 데이터 접근은 이 파일의 async 함수로만 합니다.
// 지금은 Mock(브라우저 localStorage)으로 동작하고, 나중에 Supabase 연동 시 이 파일만 교체합니다.
// =====================================================================
window.DataService = (function () {
  const KEY = APP_CONFIG.STORAGE_KEY;
  const USER = APP_CONFIG.USER_ID;
  const clone = o => JSON.parse(JSON.stringify(o));
  const nowISO = () => new Date().toISOString();
  const uid = p => p + '-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
  const instKey = (symbol, exchange) => String(symbol || '').trim().toUpperCase() + '@' + String(exchange || '').trim().toUpperCase();
  const fail = (msg, code, extra) => Object.assign(new Error(msg), { code }, extra || {});

  // ---------------------------------------------------------------
  // Mock 저장소 (localStorage). 페이지를 옮겨 다녀도 변경 내용이 유지됩니다.
  // ---------------------------------------------------------------
  let state = null;
  const listeners = [];

  function seed() {
    return {
      version: 2,
      brokers: clone(MOCK.brokers), // 증권 마스터: 증권사
      accountTypes: clone(MOCK.accountTypes), // 증권 마스터: 계좌종류
      accounts: clone(MOCK.accounts),
      instruments: clone(MOCK.instruments),
      holdings: clone(MOCK.holdings),
      extraSnapshots: [], // [08:00 스냅샷 생성 시뮬레이션]으로 추가된 스냅샷
      meta: { baseDate: Fmt.todayKST(), baseSource: 'Mock 초기 데이터', changedSinceSnapshot: false, importBackup: null }
    };
  }
  // 예전(version 1) 저장 데이터 → version 2: 계좌의 증권사 이름을 증권 마스터 id 로 바꾸고 계좌종류·비고 칸 추가
  function migrate(s) {
    if (s.version === 1) {
      s.brokers = clone(MOCK.brokers);
      s.accountTypes = clone(MOCK.accountTypes);
      const fix = list => (list || []).forEach(a => {
        if (a.broker_id === undefined) {
          let b = s.brokers.find(x => x.name === a.broker);
          if (!b && a.broker) { b = { id: uid('brk'), name: a.broker, sort: 90 }; s.brokers.push(b); }
          a.broker_id = b ? b.id : null;
          const m = MOCK.accounts.find(x => x.id === a.id);
          a.account_type_id = m ? m.account_type_id : null;
          a.memo = m ? m.memo : '';
          delete a.broker;
        }
      });
      fix(s.accounts);
      if (s.meta && s.meta.importBackup) fix(s.meta.importBackup.accounts);
      s.version = 2;
    }
    return s.version === 2 ? s : null;
  }
  function load() {
    state = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = migrate(JSON.parse(raw));
    } catch (e) { /* 저장소를 못 쓰면 초기 Mock 으로 동작 */ }
    if (!state) state = seed();
  }
  function commit() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Mock 저장 실패', e); }
    snapCache = null;
    listeners.forEach(fn => fn());
  }
  window.addEventListener('storage', e => {
    if (e.key === KEY) { load(); snapCache = null; listeners.forEach(fn => fn()); }
  });
  function markChanged(manual) {
    state.meta.changedSinceSnapshot = true;
    if (manual) { state.meta.baseDate = Fmt.todayKST(); state.meta.baseSource = '직접 수정'; }
  }
  function onChange(fn) { listeners.push(fn); }
  async function resetMock() { localStorage.removeItem(KEY); load(); commit(); }

  // ---------------------------------------------------------------
  // 가격 · 환율 (향후 Kiwoom/Upbit/환율 API 대체 지점)
  // ---------------------------------------------------------------
  async function getPrices() { return { ...MOCK.prices.values }; }
  async function getFxRate() { return { ...MOCK.fx }; }

  // ---------------------------------------------------------------
  // 증권 마스터 (증권사 · 계좌종류) — 계좌는 여기 등록된 값만 선택합니다
  // ---------------------------------------------------------------
  const MASTER = {
    broker: { list: () => state.brokers, set: v => (state.brokers = v), field: 'broker_id', label: '증권사', prefix: 'brk' },
    accountType: { list: () => state.accountTypes, set: v => (state.accountTypes = v), field: 'account_type_id', label: '계좌종류', prefix: 'atp' }
  };
  const bySort = list => list.slice().sort((a, b) => (a.sort ?? 50) - (b.sort ?? 50) || a.name.localeCompare(b.name, 'ko'));
  async function getBrokers() { return clone(bySort(state.brokers)); }
  async function getAccountTypes() { return clone(bySort(state.accountTypes)); }
  function masterCheckName(kind, name, exceptId) {
    const m = MASTER[kind];
    name = String(name || '').trim();
    if (!name) throw fail(`${m.label} 이름을 입력해 주세요.`);
    if (m.list().some(x => x.id !== exceptId && x.name === name)) throw fail(`같은 이름의 ${m.label}가 이미 있습니다.`);
    return name;
  }
  async function addMaster(kind, name) {
    const m = MASTER[kind];
    const item = { id: uid(m.prefix), name: masterCheckName(kind, name), sort: Math.max(0, ...m.list().filter(x => x.sort < 99).map(x => x.sort || 0)) + 1 };
    m.list().push(item);
    commit();
    return clone(item);
  }
  // 이름 수정 → 그 값을 쓰는 모든 계좌에 바로 반영 (계좌는 id 로 연결)
  async function updateMaster(kind, id, name) {
    const item = MASTER[kind].list().find(x => x.id === id);
    if (!item) throw fail('항목을 찾을 수 없습니다.');
    item.name = masterCheckName(kind, name, id);
    commit();
    return clone(item);
  }
  async function deleteMaster(kind, id) {
    const m = MASTER[kind];
    const used = state.accounts.filter(a => a[m.field] === id);
    if (used.length) throw fail(`이 ${m.label}를 쓰는 계좌가 ${used.length}개 있어 삭제할 수 없습니다: ${used.map(a => a.name).join(', ')}`, 'IN_USE');
    m.set(m.list().filter(x => x.id !== id));
    commit();
  }
  const brokerName = id => (state.brokers.find(b => b.id === id) || {}).name || '';
  const typeName = id => (state.accountTypes.find(t => t.id === id) || {}).name || '';

  // ---------------------------------------------------------------
  // 계좌 (증권사·계좌종류는 증권 마스터 id, memo = 비고)
  // ---------------------------------------------------------------
  // 화면 편의를 위해 broker(증권사 이름)·account_type(계좌종류 이름)을 함께 돌려줍니다.
  const withNames = a => ({ ...clone(a), broker: brokerName(a.broker_id), account_type: typeName(a.account_type_id) });
  async function getAccounts() { return state.accounts.map(withNames); }
  function normalizeAccount(a, exceptId) {
    const name = String(a.name || '').trim();
    if (!name) throw fail('계좌명을 입력해 주세요.');
    if (!state.brokers.some(b => b.id === a.broker_id)) throw fail('증권사를 선택해 주세요.');
    if (a.account_type_id && !state.accountTypes.some(t => t.id === a.account_type_id)) throw fail('계좌종류를 다시 선택해 주세요.');
    if (state.accounts.some(x => x.id !== exceptId && x.name === name)) throw fail('같은 이름의 계좌가 이미 있습니다.');
    return { name, broker_id: a.broker_id, account_type_id: a.account_type_id || null, memo: String(a.memo || '').trim() };
  }
  async function addAccount(a) {
    const acc = { id: uid('acc'), user_id: USER, ...normalizeAccount(a), created_at: nowISO(), updated_at: nowISO() };
    state.accounts.push(acc);
    markChanged(true); commit();
    return withNames(acc);
  }
  async function updateAccount(id, a) {
    const acc = state.accounts.find(x => x.id === id);
    if (!acc) throw fail('계좌를 찾을 수 없습니다.');
    Object.assign(acc, normalizeAccount(a, id), { updated_at: nowISO() });
    markChanged(true); commit();
    return withNames(acc);
  }
  async function deleteAccount(id) {
    if (state.holdings.some(h => h.account_id === id)) throw fail('보유 종목을 먼저 정리해 주세요.', 'HAS_HOLDINGS');
    state.accounts = state.accounts.filter(x => x.id !== id);
    markChanged(true); commit();
  }

  // ---------------------------------------------------------------
  // 종목 마스터
  // ---------------------------------------------------------------
  async function getInstruments() { return clone(state.instruments); }
  async function searchInstruments(q) {
    const s = String(q || '').trim().toLowerCase();
    const list = !s ? state.instruments : state.instruments.filter(i =>
      [i.name, i.symbol, i.eng_name].some(v => String(v || '').toLowerCase().includes(s)));
    return clone(list);
  }
  async function addInstrument(i) {
    const inst = {
      id: uid('ins'), user_id: USER,
      name: String(i.name || '').trim(), eng_name: String(i.eng_name || '').trim(),
      symbol: String(i.symbol || '').trim().toUpperCase(), exchange: String(i.exchange || '').trim().toUpperCase(),
      asset_type: i.asset_type, currency: i.currency, asset_group: i.asset_group || null,
      created_at: nowISO(), updated_at: nowISO()
    };
    if (!inst.name || !inst.symbol || !inst.exchange) throw fail('종목명, 심볼, 거래소를 입력해 주세요.');
    if (!APP_CONFIG.ASSET_TYPES.includes(inst.asset_type)) throw fail('자산유형을 선택해 주세요.');
    if (!APP_CONFIG.CURRENCIES.includes(inst.currency)) throw fail('통화를 선택해 주세요.');
    const dup = state.instruments.find(x => instKey(x.symbol, x.exchange) === instKey(inst.symbol, inst.exchange));
    if (dup) throw fail(`이미 등록된 종목입니다: ${dup.name} (${dup.symbol}/${dup.exchange})`, 'DUPLICATE', { instrument: clone(dup) });
    state.instruments.push(inst);
    commit();
    return clone(inst);
  }
  // ---------------------------------------------------------------
  // 외부 종목 목록 (catalog) — 한 달에 한 번 외부에서 받아와 DB 에 저장, 검색은 저장된 목록을 조회
  // (Mock: mock/catalog.js 를 '저장된 목록'으로 사용. 실제 연동 시 월 1회 Edge Function + Cron 으로 갱신)
  // ---------------------------------------------------------------
  const catalogKey = x => instKey(x.symbol, x.exchange);
  function catalogFind(symbol, exchange) {
    const k = instKey(symbol, exchange);
    return MOCK.catalog.items.find(x => catalogKey(x) === k) || null;
  }
  async function getCatalogInfo() {
    const syncedAt = state.meta.catalogSyncedAt || MOCK.catalog.synced_at;
    const next = new Date(syncedAt);
    next.setMonth(next.getMonth() + 1);
    return { count: MOCK.catalog.items.length, syncedAt, nextSyncAt: next.toISOString() };
  }
  // 목록 최신화: 외부 목록을 다시 받아 저장하고, 이미 등록된 종목은 심볼+거래소가 같으면 새 종목명으로 바꿉니다.
  // (Mock: 외부 목록 = mock/catalog.js. 실제로는 외부에서 받아 DB 의 목록을 교체)
  // 보유·자산군은 종목 고유번호(id)로 연결되어 있어 이름이 바뀌어도 그대로 유지됩니다. 과거 스냅샷은 당시 이름 그대로.
  async function syncCatalog() {
    const renamed = [];
    state.instruments.forEach(inst => {
      const c = catalogFind(inst.symbol, inst.exchange);
      if (!c) return;
      if (c.name !== inst.name || (c.eng_name && c.eng_name !== inst.eng_name)) {
        if (c.name !== inst.name) renamed.push({ symbol: inst.symbol, exchange: inst.exchange, from: inst.name, to: c.name });
        inst.name = c.name;
        if (c.eng_name) inst.eng_name = c.eng_name;
        inst.updated_at = nowISO();
      }
    });
    state.meta.catalogSyncedAt = nowISO();
    commit();
    return { ...(await getCatalogInfo()), renamed };
  }
  // 정기 갱신: 다음 갱신 시각이 지났으면 자동으로 최신화 (실제로는 매월 서버의 Cron 이 실행)
  async function autoSyncCatalogIfDue() {
    const info = await getCatalogInfo();
    if (new Date() >= new Date(info.nextSyncAt)) return syncCatalog();
    return null;
  }
  // 종목 검색: 이미 등록된 종목(registered) + 외부 목록에만 있는 종목을 함께 돌려줍니다.
  async function searchCatalog(q) {
    const s = String(q || '').trim().toLowerCase();
    const match = x => !s || [x.name, x.symbol, x.eng_name].some(v => String(v || '').toLowerCase().includes(s));
    const regKeys = new Set(state.instruments.map(catalogKey));
    const list = state.instruments.filter(match).map(i => ({ ...clone(i), registered: true }));
    MOCK.catalog.items.filter(x => !regKeys.has(catalogKey(x)) && match(x))
      .forEach(x => list.push({ ...x, id: null, asset_group: null, registered: false }));
    return list;
  }
  // 검색 결과에서 고른 종목이 아직 등록 전이면 종목 마스터에 등록하고 돌려줍니다.
  async function ensureInstrument(entry) {
    if (entry.id) return clone(state.instruments.find(i => i.id === entry.id));
    const found = state.instruments.find(i => catalogKey(i) === catalogKey(entry));
    if (found) return clone(found);
    return addInstrument({ ...entry, asset_group: null });
  }

  // 자산군 매핑 변경 — instruments.asset_group UPDATE 만 합니다 (7항). group=null 이면 해제.
  async function updateInstrumentGroup(id, group) {
    const inst = state.instruments.find(x => x.id === id);
    if (!inst) throw fail('종목을 찾을 수 없습니다.');
    if (group !== null && !Groups.codes.includes(group)) throw fail('알 수 없는 자산군입니다.');
    inst.asset_group = group;
    inst.updated_at = nowISO();
    markChanged(false); commit();
    return clone(inst);
  }

  // ---------------------------------------------------------------
  // 보유 (계좌 × 종목)
  // ---------------------------------------------------------------
  function normalizeHolding(inst, h) {
    const isCash = inst.asset_type === 'CASH';
    const q = Number(h.quantity);
    const ap = isCash ? 1 : Number(h.avg_price);
    const fx = inst.currency === 'USD' ? Number(h.avg_fx_rate) : 1;
    if (!(q > 0)) throw fail('수량은 0보다 커야 합니다.');
    if (h.avg_price === '' && !isCash) throw fail('평균매입가를 입력해 주세요.');
    if (!(ap >= 0)) throw fail('평균매입가는 0 이상이어야 합니다.');
    if (!(fx > 0)) throw fail('USD 종목의 매입 평균환율은 0보다 커야 합니다.');
    return { quantity: q, avg_price: ap, avg_fx_rate: fx };
  }
  async function getHoldings() { return clone(state.holdings); }
  async function addHolding(h) {
    const inst = state.instruments.find(x => x.id === h.instrument_id);
    if (!inst) throw fail('종목을 찾을 수 없습니다.');
    if (!state.accounts.some(a => a.id === h.account_id)) throw fail('계좌를 찾을 수 없습니다.');
    const dup = state.holdings.find(x => x.account_id === h.account_id && x.instrument_id === h.instrument_id);
    if (dup) throw fail('이 계좌에 이미 있는 종목입니다. 기존 보유를 수정해 주세요.', 'DUPLICATE', { holding: clone(dup) });
    const row = { id: uid('h'), user_id: USER, account_id: h.account_id, instrument_id: h.instrument_id, ...normalizeHolding(inst, h), created_at: nowISO(), updated_at: nowISO() };
    state.holdings.push(row);
    markChanged(true); commit();
    return clone(row);
  }
  async function updateHolding(id, h) {
    const row = state.holdings.find(x => x.id === id);
    if (!row) throw fail('보유 내역을 찾을 수 없습니다.');
    const inst = state.instruments.find(x => x.id === row.instrument_id);
    Object.assign(row, normalizeHolding(inst, h), { updated_at: nowISO() });
    markChanged(true); commit();
    return clone(row);
  }
  // 해당 계좌의 holdings 행만 삭제 (종목 마스터·다른 계좌·과거 이력은 유지)
  async function deleteHolding(id) {
    state.holdings = state.holdings.filter(x => x.id !== id);
    markChanged(true); commit();
  }

  // 화면 상단 상태 정보
  async function getStatus() {
    const list = allSnapshots();
    const last = list.length ? list[list.length - 1].snapshot : null;
    return {
      baseDate: state.meta.baseDate,
      baseSource: state.meta.baseSource,
      changedSinceSnapshot: !!state.meta.changedSinceSnapshot,
      canUndo: !!state.meta.importBackup,
      lastSnapshot: last ? { date: last.snapshot_date, time: last.snapshot_time, simulated: !!last.simulated } : null,
      nextSnapshotDate: last ? Fmt.addDays(last.snapshot_date, 1) : Fmt.todayKST()
    };
  }

  // ---------------------------------------------------------------
  // 스냅샷 (과거 이력)
  // ---------------------------------------------------------------
  function makeSnapshot(date, entries, fxRate, createdAt) {
    const id = 'snap-' + date;
    const created = createdAt || date + 'T08:00:00+09:00';
    const items = entries.filter(e => e.holding.quantity > 0).map((e, i) => {
      const inst = e.instrument, h = e.holding;
      const isUSD = inst.currency === 'USD';
      const q = +h.quantity, ap = +h.avg_price, cp = +e.price;
      const invO = q * ap, valO = q * cp;
      return {
        id: id + '-' + i, snapshot_id: id, user_id: USER,
        account_id: e.account.id, account_name: e.account.name,
        instrument_id: inst.id, name: inst.name, symbol: inst.symbol, exchange: inst.exchange,
        asset_type: inst.asset_type, asset_group: inst.asset_group || 'OTHER_STOCK', currency: inst.currency,
        quantity: q, avg_price: ap, avg_fx_rate: isUSD ? +h.avg_fx_rate : 1,
        current_price: cp, current_price_currency: inst.currency,
        exchange_rate: fxRate, exchange_rate_pair: 'USD/KRW',
        value_original_currency: valO, invested_original_currency: invO,
        profit_original_currency: valO - invO, return_pct_original_currency: Calc.pct(valO - invO, invO),
        created_at: created
      };
    });
    // KRW 요약 캐시 (16항)
    let inv = 0, val = 0;
    const gv = {}, gi = {};
    Groups.codes.forEach(c => { gv[c] = 0; gi[c] = 0; });
    items.forEach(it => {
      const r = Calc.row(it, it.currency, it.current_price, it.exchange_rate);
      inv += r.invK; val += r.valK; gv[it.asset_group] += r.valK; gi[it.asset_group] += r.invK;
    });
    Groups.codes.forEach(c => { gv[c] = Math.round(gv[c]); gi[c] = Math.round(gi[c]); });
    return {
      snapshot: {
        id, user_id: USER, snapshot_date: date, snapshot_time: '08:00',
        total_value_krw: Math.round(val), total_invested_krw: Math.round(inv), total_profit_krw: Math.round(val - inv),
        total_return_pct: Calc.pct(val - inv, inv), exchange_rate: fxRate,
        group_values: gv, group_invested: gi, item_count: items.length, created_at: created, simulated: false
      },
      items
    };
  }

  let baseCache = null, snapCache = null;
  function scheduledLastDate() {
    const t = Fmt.todayKST();
    return Fmt.hourKST() >= 8 ? t : Fmt.addDays(t, -1);
  }
  function allSnapshots() {
    const last = scheduledLastDate();
    if (!baseCache || baseCache.lastDate !== last) {
      baseCache = { lastDate: last, list: MOCK.buildBaseSnapshots(last, makeSnapshot) };
      snapCache = null;
    }
    if (!snapCache) {
      const extraDates = new Set(state.extraSnapshots.map(s => s.snapshot.snapshot_date));
      const list = baseCache.list.filter(s => !extraDates.has(s.snapshot.snapshot_date)).concat(state.extraSnapshots);
      list.sort((a, b) => (a.snapshot.snapshot_date < b.snapshot.snapshot_date ? -1 : 1));
      snapCache = { list, byId: Object.fromEntries(list.map(s => [s.snapshot.id, s])) };
    }
    return snapCache.list;
  }
  // range: '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL' | { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (양 끝 포함)
  async function getSnapshots(range) {
    const list = allSnapshots();
    if (!list.length) return [];
    if (range && typeof range === 'object') {
      return list.filter(s => (!range.from || s.snapshot.snapshot_date >= range.from) && (!range.to || s.snapshot.snapshot_date <= range.to)).map(s => s.snapshot);
    }
    const lastDate = list[list.length - 1].snapshot.snapshot_date;
    const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range];
    let from = null;
    if (range === '1W') from = Fmt.addDays(lastDate, -7);
    else if (months) {
      const d = new Date(lastDate + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - months);
      from = d.toISOString().slice(0, 10);
    }
    return list.filter(s => !from || s.snapshot.snapshot_date > from).map(s => s.snapshot);
  }
  async function getSnapshotItems(snapshotId) {
    allSnapshots();
    const s = snapCache.byId[snapshotId];
    return s ? s.items : [];
  }
  // 08:00 정기 스냅샷 (Mock 시뮬레이션 → 향후 Edge Function). 저장된 스냅샷은 이후 변경하지 않습니다.
  async function createDailySnapshot(date) {
    const list = allSnapshots();
    const lastDate = list.length ? list[list.length - 1].snapshot.snapshot_date : Fmt.addDays(Fmt.todayKST(), -1);
    date = date || Fmt.addDays(lastDate, 1);
    if (list.some(s => s.snapshot.snapshot_date === date)) throw fail(`${date} 스냅샷이 이미 있습니다 (날짜별 1건).`);
    const prices = await getPrices();
    const fx = (await getFxRate()).rate;
    const instMap = Object.fromEntries(state.instruments.map(i => [i.id, i]));
    const accMap = Object.fromEntries(state.accounts.map(a => [a.id, a]));
    const entries = state.holdings.map(h => {
      const inst = instMap[h.instrument_id];
      let price = inst.asset_type === 'CASH' ? 1 : prices[inst.id];
      if (price == null) price = h.avg_price;
      return { account: accMap[h.account_id], instrument: inst, holding: h, price };
    });
    const snap = clone(makeSnapshot(date, entries, fx, nowISO()));
    snap.snapshot.simulated = true;
    state.extraSnapshots.push(snap);
    state.meta.changedSinceSnapshot = false;
    state.meta.importBackup = null; // 되돌리기는 다음 스냅샷 전까지만
    commit();
    return clone(snap.snapshot);
  }

  // ---------------------------------------------------------------
  // XLSX 업로드 / 다운로드 (SheetJS, 브라우저에서만 처리 — 서버 전송 없음)
  // ---------------------------------------------------------------
  const HEADERS = MOCK.xlsxSamples.headers;
  const OPTIONAL_HEADERS = ['자산유형', '자산군', '계좌종류', '비고'];
  const REQUIRED_HEADERS = HEADERS.filter(h => !OPTIONAL_HEADERS.includes(h));
  const pad = n => String(n).padStart(2, '0');

  function cleanNum(v) {
    if (typeof v === 'number') return v;
    const s = String(v ?? '').replace(/[,\s₩$]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function parseDateCell(c) {
    if (typeof c.v === 'number') {
      const p = XLSX.SSF.parse_date_code(c.v);
      return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null;
    }
    if (c.v instanceof Date) return `${c.v.getFullYear()}-${pad(c.v.getMonth() + 1)}-${pad(c.v.getDate())}`;
    const s = String(c.v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d) || d.toISOString().slice(0, 10) !== s ? null : s;
  }

  async function parseHoldingsXlsx(file) {
    const res = { fileName: file.name, baseDate: null, rows: [], fileErrors: [] };
    const E = (col, value, reason) => res.fileErrors.push({ row: '-', col, value: String(value ?? ''), reason });
    if (!/\.xlsx$/i.test(file.name)) { E('파일', file.name, '확장자가 .xlsx 가 아닙니다'); return res; }
    if (file.size > 5 * 1024 * 1024) { E('파일', file.name, '파일 크기가 5MB를 초과합니다'); return res; }
    let wb;
    try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); }
    catch (e) { E('파일', file.name, '읽을 수 없는 파일입니다'); return res; }

    const info = wb.Sheets['기준정보'];
    if (!info) E('기준정보', '', '기준정보 시트가 없습니다');
    else {
      const b1 = info['B1'];
      if (!b1 || b1.v == null || String(b1.v).trim() === '') E('기준일자', '', '기준일자(B1)가 비어 있습니다');
      else {
        const d = parseDateCell(b1);
        if (!d) E('기준일자', b1.w || b1.v, '날짜 형식 오류 (YYYY-MM-DD)');
        else res.baseDate = d;
      }
    }
    const ws = wb.Sheets['보유'];
    if (!ws) { E('보유', '', '보유 시트가 없습니다'); return res; }
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const header = (aoa[0] || []).map(h => String(h).trim());
    const missing = REQUIRED_HEADERS.filter(h => !header.includes(h));
    if (missing.length) { E('헤더', missing.join(', '), '필수 헤더 누락'); return res; }
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i] || [];
      if (line.every(v => String(v).trim() === '')) continue;
      const raw = {};
      HEADERS.forEach(h => { const idx = header.indexOf(h); raw[h] = idx >= 0 ? line[idx] : ''; });
      res.rows.push({ rowNo: i + 1, raw });
    }
    if (!res.rows.length) E('보유', '', '데이터 행이 0건입니다');
    return res;
  }

  async function validateImport(parsed) {
    const errors = [...parsed.fileErrors], warnings = [];
    const add = (list, row, col, value, reason) => list.push({ row, col, value: String(value ?? ''), reason });
    const today = Fmt.todayKST();
    if (parsed.baseDate) {
      if (parsed.baseDate > today) add(errors, '-', '기준일자', parsed.baseDate, '기준일자가 오늘(KST) 이후입니다');
      else {
        if (parsed.baseDate !== today) add(warnings, '-', '기준일자', parsed.baseDate, '기준일자가 오늘과 다릅니다');
        if (parsed.baseDate < state.meta.baseDate) add(warnings, '-', '기준일자', parsed.baseDate, `기준일자가 현재 현황의 기준일(${state.meta.baseDate})보다 이전입니다`);
      }
    }
    const instByKey = Object.fromEntries(state.instruments.map(i => [instKey(i.symbol, i.exchange), i]));
    const rows = [], seen = {}, brokerByAcc = {}, newSeen = {};

    parsed.rows.forEach(({ rowNo, raw }) => {
      const s = h => String(raw[h] ?? '').trim();
      const err = (col, reason, value) => add(errors, rowNo, col, value !== undefined ? value : raw[col], reason);
      const warn = (col, reason, value) => add(warnings, rowNo, col, value !== undefined ? value : raw[col], reason);

      ['계좌명', '증권사', '종목명', '심볼', '거래소', '통화'].forEach(h => { if (!s(h)) err(h, '필수 값이 비어 있습니다'); });
      const currency = s('통화').toUpperCase();
      if (currency && !APP_CONFIG.CURRENCIES.includes(currency)) err('통화', '통화는 KRW 또는 USD만 가능합니다');

      const numCheck = (col, v, rule, ruleMsg) => {
        if (v === null) err(col, '필수 값이 비어 있습니다');
        else if (isNaN(v)) err(col, '숫자가 아닙니다');
        else if (!rule(v)) err(col, ruleMsg);
      };
      const q = cleanNum(raw['수량']);
      numCheck('수량', q, v => v > 0, '수량은 0보다 커야 합니다');
      const ap = cleanNum(raw['평균매입가']);
      numCheck('평균매입가', ap, v => v >= 0, '평균매입가는 0 이상이어야 합니다');
      const fxv = cleanNum(raw['매입평균환율']);
      if (currency === 'USD') {
        if (fxv === null) err('매입평균환율', 'USD 종목은 매입평균환율이 필요합니다');
        else if (isNaN(fxv)) err('매입평균환율', '숫자가 아닙니다');
        else if (fxv <= 0) err('매입평균환율', '매입평균환율은 0보다 커야 합니다');
      } else if (currency === 'KRW' && fxv !== null && fxv !== 1) {
        err('매입평균환율', 'KRW 종목의 매입평균환율은 비우거나 1이어야 합니다');
      }

      let symbol = s('심볼').toUpperCase();
      const exchange = s('거래소').toUpperCase();
      if (exchange === 'KRX' && /^\d{1,5}$/.test(symbol)) symbol = symbol.padStart(6, '0'); // 엑셀이 005930 → 5930 으로 바꾼 경우
      const key = instKey(symbol, exchange);
      const existing = instByKey[key];
      let assetType = s('자산유형').toUpperCase();
      const groupRaw = s('자산군');
      let group = null;
      if (groupRaw) {
        const g = Groups.parse(groupRaw);
        if (g === undefined) err('자산군', '7개 자산군에 없는 값입니다');
        else group = g;
      }
      const isCash = existing ? existing.asset_type === 'CASH' : assetType === 'CASH' || exchange === 'CASH';
      if (isCash && ap !== null && !isNaN(ap) && ap !== 1) err('평균매입가', '현금 행의 평균매입가는 1이어야 합니다');

      if (existing) {
        if (currency && APP_CONFIG.CURRENCIES.includes(currency) && existing.currency !== currency) err('통화', `종목 마스터의 통화(${existing.currency})와 다릅니다`);
        if (groupRaw && group && group !== existing.asset_group)
          warn('자산군', `기존 종목은 현재 매핑(${existing.asset_group ? Groups.name(existing.asset_group) : '미지정'})을 유지합니다 — 입력값 무시`);
        if (s('종목명') && s('종목명') !== existing.name) warn('종목명', `종목 마스터 이름(${existing.name})과 다릅니다 — 마스터 이름 사용`);
      } else if (symbol && exchange) {
        const cat = catalogFind(symbol, exchange);
        if (!assetType && cat) assetType = cat.asset_type; // 외부 종목 목록에 있으면 자산유형을 채움
        if (!assetType) err('자산유형', '신규 종목은 자산유형이 필요합니다');
        else if (!APP_CONFIG.ASSET_TYPES.includes(assetType)) err('자산유형', 'ETF, STOCK, CRYPTO, GOLD, CASH 중 하나여야 합니다');
        if (!newSeen[key]) {
          newSeen[key] = true;
          warn('심볼', cat ? '외부 종목 목록에서 찾아 새로 등록됩니다' : '종목 마스터·외부 종목 목록에 없어 새로 등록됩니다', `${symbol}/${exchange}`);
          if (!groupRaw) warn('자산군', '자산군이 비어 있어 기타종목(미지정)으로 집계됩니다', '');
        }
      }

      const acc = s('계좌명'), broker = s('증권사'), accType = s('계좌종류'), memo = s('비고');
      if (broker && !state.brokers.some(b => b.name === broker)) err('증권사', '증권 마스터에 없는 증권사입니다 (계좌 관리 › 증권 마스터 수정에서 먼저 등록)');
      if (accType && !state.accountTypes.some(t => t.name === accType)) err('계좌종류', '증권 마스터에 없는 계좌종류입니다 (계좌 관리 › 증권 마스터 수정에서 먼저 등록)');
      if (acc && broker) {
        const b = brokerByAcc[acc];
        if (b && b.broker !== broker) err('증권사', `같은 계좌명(${acc})에 증권사가 다릅니다 (${b.row}행: ${b.broker})`);
        else if (b && accType && b.accType && b.accType !== accType) err('계좌종류', `같은 계좌명(${acc})에 계좌종류가 다릅니다 (${b.row}행: ${b.accType})`);
        else if (!b) brokerByAcc[acc] = { broker, accType, row: rowNo };
        else if (!b.accType && accType) b.accType = accType;
      }
      if (acc && symbol && exchange) {
        const dk = acc + '|' + key;
        if (seen[dk]) err('심볼', `같은 계좌에 같은 종목이 중복됩니다 (${seen[dk]}행과 중복)`, `${symbol}/${exchange}`);
        else seen[dk] = rowNo;
      }
      rows.push({
        rowNo, account: acc, broker, accType, memo, name: s('종목명'), symbol, exchange,
        asset_type: existing ? existing.asset_type : assetType,
        currency: existing ? existing.currency : currency,
        quantity: q, avg_price: isCash ? 1 : ap, avg_fx_rate: currency === 'USD' ? fxv : 1,
        group, existingId: existing ? existing.id : null
      });
    });
    return { fileName: parsed.fileName, baseDate: parsed.baseDate, errors, warnings, rows };
  }

  function buildImportState(v) {
    const now = nowISO();
    const instruments = clone(state.instruments);
    const byKey = Object.fromEntries(instruments.map(i => [instKey(i.symbol, i.exchange), i]));
    const accounts = [], accByName = {}, holdings = [];
    v.rows.forEach(r => {
      const k = instKey(r.symbol, r.exchange);
      let inst = byKey[k];
      if (!inst) {
        inst = { id: uid('ins'), user_id: USER, name: r.name, eng_name: '', symbol: r.symbol, exchange: r.exchange, asset_type: r.asset_type, currency: r.currency, asset_group: r.group, created_at: now, updated_at: now };
        instruments.push(inst);
        byKey[k] = inst;
      }
      let acc = accByName[r.account];
      if (!acc) {
        const old = state.accounts.find(a => a.name === r.account);
        const fileType = v.rows.find(x => x.account === r.account && x.accType);
        const fileMemo = v.rows.find(x => x.account === r.account && x.memo);
        acc = {
          id: old ? old.id : uid('acc'), user_id: USER, name: r.account,
          broker_id: (state.brokers.find(b => b.name === r.broker) || {}).id || null,
          account_type_id: fileType ? (state.accountTypes.find(t => t.name === fileType.accType) || {}).id || null : old ? old.account_type_id : null,
          memo: fileMemo ? fileMemo.memo : old ? old.memo || '' : '',
          created_at: old ? old.created_at : now, updated_at: now
        };
        accounts.push(acc);
        accByName[r.account] = acc;
      }
      holdings.push({
        id: uid('h'), user_id: USER, account_id: acc.id, instrument_id: inst.id,
        quantity: r.quantity, avg_price: inst.asset_type === 'CASH' ? 1 : r.avg_price,
        avg_fx_rate: inst.currency === 'USD' ? r.avg_fx_rate : 1, created_at: now, updated_at: now
      });
    });
    return { accounts, holdings, instruments };
  }
  // 반영했을 때의 현황 미리보기 (현재가·환율은 반영 시점 값)
  async function previewImport(v) {
    const s = buildImportState(v);
    const prices = await getPrices();
    const fx = (await getFxRate()).rate;
    const accounts = s.accounts.map(withNames); // 미리보기 표에 증권사·계좌종류 이름 표시
    return { ...s, accounts, baseDate: v.baseDate, fx, model: Calc.buildModel({ ...s, accounts, prices, fx }) };
  }
  // 현재 계좌·보유 전체를 파일 내용으로 교체 (전부 반영 또는 전부 취소)
  async function replaceCurrentHoldings(v) {
    if (!v || v.errors.length) throw fail('오류가 있어 반영할 수 없습니다.');
    const next = buildImportState(v); // 실패하면 여기서 중단 → 현재 데이터는 그대로
    const backup = clone({ accounts: state.accounts, holdings: state.holdings, instruments: state.instruments, meta: { ...state.meta, importBackup: null } });
    state.accounts = next.accounts;
    state.holdings = next.holdings;
    state.instruments = next.instruments;
    state.meta.baseDate = v.baseDate;
    state.meta.baseSource = 'XLSX 업로드';
    state.meta.changedSinceSnapshot = true;
    state.meta.importBackup = backup;
    commit();
    return { accountCount: next.accounts.length, holdingCount: next.holdings.length };
  }
  async function undoLastImport() {
    const b = state.meta.importBackup;
    if (!b) throw fail('되돌릴 업로드가 없습니다.');
    state.accounts = b.accounts;
    state.holdings = b.holdings;
    state.instruments = b.instruments;
    state.meta = { ...b.meta, importBackup: null };
    commit();
  }

  function buildWorkbook(baseDate, rows) {
    const wb = XLSX.utils.book_new();
    const info = XLSX.utils.aoa_to_sheet([['기준일자', baseDate], ['안내', '업로드할 현황의 기준일입니다 (YYYY-MM-DD). 직접 바꿀 수 있습니다.']]);
    info['B1'] = { t: 's', v: baseDate };
    info['!cols'] = [{ wch: 12 }, { wch: 60 }];
    const hs = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
    hs['!cols'] = [14, 12, 28, 12, 9, 9, 6, 14, 14, 12, 10, 12, 30].map(w => ({ wch: w }));
    const guide = XLSX.utils.aoa_to_sheet(MOCK.xlsxSamples.guide);
    guide['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, info, '기준정보');
    XLSX.utils.book_append_sheet(wb, hs, '보유');
    XLSX.utils.book_append_sheet(wb, guide, '작성안내');
    return wb;
  }
  function currentRows() {
    const instMap = Object.fromEntries(state.instruments.map(i => [i.id, i]));
    const rows = [];
    state.accounts.forEach(acc => {
      state.holdings.filter(h => h.account_id === acc.id).forEach(h => {
        const inst = instMap[h.instrument_id];
        rows.push([acc.name, brokerName(acc.broker_id), inst.name, inst.symbol, inst.exchange, inst.asset_type, inst.currency,
          h.quantity, h.avg_price, inst.currency === 'USD' ? h.avg_fx_rate : '', inst.asset_group ? Groups.name(inst.asset_group) : '',
          typeName(acc.account_type_id), acc.memo || '']);
      });
    });
    return rows;
  }
  async function exportHoldingsXlsx() {
    XLSX.writeFile(buildWorkbook(state.meta.baseDate, currentRows()), `myAsset_현재보유_${state.meta.baseDate}.xlsx`);
  }
  async function downloadSampleXlsx(baseDate) {
    const d = baseDate || Fmt.todayKST();
    XLSX.writeFile(buildWorkbook(d, MOCK.xlsxSamples.sample), `myAsset_샘플데이터_${d}.xlsx`);
  }
  async function downloadTemplateXlsx(baseDate) {
    const d = baseDate || Fmt.todayKST();
    XLSX.writeFile(buildWorkbook(d, MOCK.xlsxSamples.template), `myAsset_업로드양식_${d}.xlsx`);
  }
  async function downloadIssuesXlsx(errors, warnings) {
    const aoa = [['구분', '행 번호', '컬럼', '입력값', '사유']];
    errors.forEach(e => aoa.push(['오류', e.row, e.col, e.value, e.reason]));
    warnings.forEach(e => aoa.push(['경고', e.row, e.col, e.value, e.reason]));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 8, 12, 20, 60].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, '점검결과');
    XLSX.writeFile(wb, `myAsset_업로드점검결과_${Fmt.todayKST()}.xlsx`);
  }

  load();

  return {
    onChange, resetMock, getStatus,
    getAccounts, addAccount, updateAccount, deleteAccount,
    getBrokers, getAccountTypes, addMaster, updateMaster, deleteMaster,
    getInstruments, searchInstruments, addInstrument, updateInstrumentGroup,
    getCatalogInfo, syncCatalog, autoSyncCatalogIfDue, searchCatalog, ensureInstrument,
    getHoldings, addHolding, updateHolding, deleteHolding,
    getPrices, getFxRate,
    getSnapshots, getSnapshotItems, createDailySnapshot,
    parseHoldingsXlsx, validateImport, previewImport, replaceCurrentHoldings, undoLastImport,
    exportHoldingsXlsx, downloadSampleXlsx, downloadTemplateXlsx, downloadIssuesXlsx,
    // 자체 점검(tools/selftest.html) 전용
    _test: { buildWorkbook, currentRows, getBaseDate: () => state.meta.baseDate }
  };
})();
