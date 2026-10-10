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

  // 투자 목표 비중 기본값 (기준별 자산군 목표 %, 합계 100). 화면: 계좌/자산관리 › 자산 구성 관리 › 목표 비중
  const DEFAULT_TARGETS = [
    { id: 'tgt-above', name: '200일선 +1% 이상', weights: { CASH: 49, LEVERAGE: 20, NASDAQ100: 20, SP500: 0, OTHER_STOCK: 0, GOLD: 10, BLOCKCHAIN: 1 } },
    { id: 'tgt-below', name: '200일선 −1% 이하', weights: { CASH: 69, LEVERAGE: 0, NASDAQ100: 20, SP500: 0, OTHER_STOCK: 0, GOLD: 10, BLOCKCHAIN: 1 } }
  ];

  function seed() {
    return {
      version: 2,
      brokers: clone(MOCK.brokers), // 증권 마스터: 증권사
      accountTypes: clone(MOCK.accountTypes), // 증권 마스터: 계좌종류
      accounts: clone(MOCK.accounts),
      instruments: clone(MOCK.instruments),
      holdings: clone(MOCK.holdings),
      extraSnapshots: [], // [08:00 스냅샷 생성 시뮬레이션]으로 추가된 스냅샷
      groups: clone(APP_CONFIG.GROUPS), // 자산군 목록 (추가·삭제 가능)
      targets: clone(DEFAULT_TARGETS), // 투자 목표 비중 (기준별 자산군 목표 %)
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
    prepare();
  }
  // 불러온 데이터(브라우저 저장본 또는 Supabase)를 현재 버전 형태로 맞춤
  function prepare() {
    if (!state.targets) state.targets = clone(DEFAULT_TARGETS); // 예전 저장 데이터에는 목표 비중이 없음
    if (!state.groups) state.groups = clone(APP_CONFIG.GROUPS); // 예전 저장 데이터는 기본 7개 자산군
    if (!state.meta.renamedCrypto) { // 자산군 이름 변경: 블록체인 → Crypto (한 번만)
      state.groups.forEach(g => { if (g.code === 'BLOCKCHAIN' && g.name === '블록체인') g.name = 'Crypto'; });
      state.meta.renamedCrypto = true;
    }
    Groups.set(state.groups);
    state.instruments.forEach(i => { if (i.asset_group && !Groups.has(i.asset_group)) i.asset_group = null; }); // 삭제된 자산군 → 미지정
    addNewDefaultBrokers();
    // 잡주 종목코드 변경 (잡주 → 999999): 이미 등록한 브라우저도 맞춰 줌
    state.instruments.forEach(i => { if (i.exchange === 'KRX' && i.symbol === '잡주') { i.symbol = '999999'; i.updated_at = nowISO(); } });
    if (!state.manualPrices) state.manualPrices = {}; // 직접 입력한 현재가 { 종목id: { price, as_of } }
  }
  // 기본 증권사 목록에 나중에 추가한 항목을, 이미 쓰고 있는 브라우저에도 한 번만 넣어 줍니다.
  // (사용자가 지운 항목이 다시 생기지 않도록 넣은 항목을 meta.addedBrokers 에 기록)
  // 증권사·계좌종류 모두 적용 (예: 메리츠증권, DC, RIA)
  const LATER_MASTER = [['brokers', 'brk-meritz'], ['accountTypes', 'atp-dc'], ['accountTypes', 'atp-ria']];
  function addNewDefaultBrokers() {
    state.meta.addedBrokers = state.meta.addedBrokers || [];
    let changed = false;
    LATER_MASTER.forEach(([listKey, id]) => {
      if (state.meta.addedBrokers.includes(id)) return;
      const def = MOCK[listKey].find(b => b.id === id);
      if (def && !state[listKey].some(b => b.id === id || b.name === def.name)) { state[listKey].push(clone(def)); changed = true; }
      state.meta.addedBrokers.push(id);
    });
    if (changed) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 다음에 다시 시도 */ } }
  }
  // auto: 화면을 열 때 자동으로 맞추는 변경(종목명 갱신 등) — 사용자가 바꾼 것으로 치지 않음
  function commit({ auto = false } = {}) {
    if (!auto) state.meta.touched = true; // 사용자가 한 번이라도 바꾼 데이터 (처음 Mock 그대로인지 구분)
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('브라우저 저장 실패', e); }
    snapCache = null;
    listeners.forEach(fn => fn());
    schedulePush();
  }
  window.addEventListener('storage', e => {
    if (e.key === KEY) { load(); snapCache = null; listeners.forEach(fn => fn()); }
  });

  // ---------------------------------------------------------------
  // Supabase 저장 (user_state 테이블: 로그인한 사용자별 1행). 다른 PC·브라우저에서도 같은 데이터
  // - 화면을 열면 서버 데이터를 먼저 불러오고, 바꿀 때마다 잠시 뒤 서버에 저장합니다.
  // - 브라우저 저장소는 빠르게 열기 위한 사본(캐시)일 뿐, 기준은 서버입니다.
  // - 다른 기기에서 먼저 저장했으면(CONFLICT) 서버의 최신 데이터로 다시 불러옵니다.
  // ---------------------------------------------------------------
  const SYNC_KEY = KEY + '.sync';
  const cloud = () => (window.Auth && Auth.client) || null;
  const readSync = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || { rev: 0, pending: false }; } catch (e) { return { rev: 0, pending: false }; } };
  const writeSync = s => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(s)); } catch (e) { /* 무시 */ } };
  const cloudListeners = [];
  let cloudStatus = { state: cloud() ? 'loading' : 'local', at: null, message: '' };
  function setCloud(st, message = '') {
    cloudStatus = { state: st, at: st === 'saved' || st === 'loaded' ? nowISO() : cloudStatus.at, message };
    cloudListeners.forEach(fn => fn(cloudStatus));
  }
  function onCloudStatus(fn) { cloudListeners.push(fn); fn(cloudStatus); }
  function getCloudStatus() { return { ...cloudStatus }; }
  const isPristine = () => !state.meta.touched && state.meta.baseSource === 'Mock 초기 데이터' && !state.meta.importBackup;
  function useServerData(row) {
    const s = migrate(clone(row.data));
    if (!s) throw new Error('서버 데이터 형식을 읽지 못했습니다.');
    state = s;
    prepare();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
    writeSync({ rev: row.rev, pending: false });
    snapCache = null;
  }
  let pushTimer = null, pushing = null;
  function schedulePush() {
    if (!cloud()) return;
    if (!readSync().rev && isPristine()) return; // 처음 Mock 그대로인 브라우저는 서버에 올리지 않음
    writeSync({ ...readSync(), pending: true });
    setCloud('pending');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushNow(); }, 700);
  }
  async function pushNow() {
    const c = cloud();
    if (!c) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    if (pushing) await pushing.catch(() => {});
    pushing = (async () => {
      const sync = readSync();
      if (!sync.pending && sync.rev) return;
      setCloud('saving');
      const { data: rev, error } = await c.rpc('save_user_state', { p_data: state, p_rev: sync.rev || 0 });
      if (!error) { writeSync({ rev, pending: false }); setCloud('saved'); return; }
      if (/CONFLICT/.test(error.message)) {
        // 다른 기기가 먼저 저장 → 서버 최신본으로 교체 (방금 변경은 반영되지 않음)
        const { data: row } = await c.from('user_state').select('data,rev').maybeSingle();
        if (row) { useServerData(row); listeners.forEach(fn => fn()); }
        setCloud('saved');
        if (window.App) App.alert('다른 기기(또는 다른 창)에서 먼저 저장한 내용이 있어 <b>서버의 최신 데이터로 다시 불러왔습니다.</b><br><small>방금 바꾼 내용은 저장되지 않았으니 화면을 확인한 뒤 다시 해 주세요.</small>', '최신 데이터로 갱신');
        return;
      }
      setCloud('error', error.message);
    })();
    try { await pushing; } catch (e) { setCloud('error', e.message); } finally { pushing = null; }
  }
  // 서버에서 불러오기 (화면을 열 때, 다른 창에서 돌아올 때)
  async function syncFromCloud() {
    const c = cloud();
    if (!c) return;
    if (pushing) await pushing.catch(() => {});
    try {
      const { data: row, error } = await c.from('user_state').select('data,rev').maybeSingle();
      if (error) throw new Error(error.message);
      const sync = readSync();
      if (!row) {
        // 서버에 아직 데이터가 없음 → 이 브라우저에 실제로 쓰던 데이터가 있으면 처음으로 올림
        if (!isPristine()) { writeSync({ rev: 0, pending: true }); await pushNow(); }
        else setCloud('empty');
        return;
      }
      if (sync.pending && sync.rev === row.rev) { await pushNow(); return; } // 저장 못 하고 남은 변경 → 이어서 저장
      if (sync.pending && window.App) App.toast('이 브라우저에서 저장하지 못한 변경이 있었지만, 다른 기기에서 바뀐 서버 데이터를 우선 불러왔습니다.', 'error');
      if (row.rev !== sync.rev || sync.pending) { useServerData(row); listeners.forEach(fn => fn()); }
      setCloud('loaded');
    } catch (e) { setCloud('error', e.message); }
  }
  // 로그아웃 전: 남은 변경을 저장하고 이 브라우저의 사본을 지움
  async function flushAndClearLocal() {
    if (readSync().pending) await pushNow();
    try { localStorage.removeItem(KEY); localStorage.removeItem(SYNC_KEY); } catch (e) { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cloud() && !pushTimer) syncFromCloud(); });
  window.addEventListener('beforeunload', e => { if (cloud() && readSync().pending) { pushNow(); e.preventDefault(); e.returnValue = ''; } });
  function markChanged(manual) {
    state.meta.changedSinceSnapshot = true;
    if (manual) { state.meta.baseDate = Fmt.todayKST(); state.meta.baseSource = '직접 수정'; }
  }
  function onChange(fn) { listeners.push(fn); }
  async function resetMock() { localStorage.removeItem(KEY); load(); commit(); }

  // ---------------------------------------------------------------
  // 가격 · 환율 (향후 Kiwoom/Upbit/환율 API 대체 지점)
  // ---------------------------------------------------------------
  // 실제 현재가는 Supabase DB(prices, fx_rates)에서 읽습니다. 서버 함수 update-prices 가 매시 정각에 저장
  //   주식·ETF·환율·국제 금시세 = Google Finance(Google 시트), 가상자산 = 업비트, KRX 금현물 = 국제 금시세 × 환율
  // DB 에 아직 가격이 없는 종목은 Mock 예시 가격(source: MOCK)을 씁니다.
  const SB = APP_CONFIG.SUPABASE;
  let live = null, liveLoading = null;
  async function sbGet(path) {
    const r = await fetch(`${SB.url}/rest/v1/${path}`, { headers: { apikey: SB.key } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  function loadLive(force) {
    if (!SB || !SB.url) return Promise.resolve(null);
    if (!force && live && Date.now() - live.at < 60000) return Promise.resolve(live);
    if (liveLoading) return liveLoading;
    liveLoading = (async () => {
      try {
        const [prices, fx, runs] = await Promise.all([
          sbGet('prices?select=symbol,exchange,price,currency,source,as_of'),
          sbGet('fx_rates?select=pair,rate,source,as_of'),
          sbGet('price_runs?select=trigger,started_at,finished_at,ok_count,fail_count,message&order=started_at.desc&limit=1')
        ]);
        live = {
          at: Date.now(), ok: true,
          prices: new Map(prices.map(p => [instKey(p.symbol, p.exchange), { ...p, price: Number(p.price) }])),
          fx: Object.fromEntries(fx.map(f => [f.pair, { ...f, rate: Number(f.rate) }])),
          run: runs[0] || null
        };
      } catch (e) {
        live = { at: Date.now(), ok: false, error: e.message, prices: new Map(), fx: {}, run: null };
      }
      liveLoading = null;
      return live;
    })();
    return liveLoading;
  }
  // 종목 id → 가격 정보 { price, source(GOOGLE·UPBIT·GOLD·MOCK), as_of }
  async function getPriceMeta() {
    const L = await loadLive();
    const out = {};
    state.instruments.forEach(i => {
      if (i.asset_type === 'CASH') return;
      const p = L && L.prices.get(instKey(i.symbol, i.exchange));
      if (p) out[i.id] = { price: p.price, source: p.source, as_of: p.as_of };
      else if (state.manualPrices[i.id]) out[i.id] = { price: state.manualPrices[i.id].price, source: 'MANUAL', as_of: state.manualPrices[i.id].as_of };
      else if (MOCK.prices.values[i.id] != null) out[i.id] = { price: MOCK.prices.values[i.id], source: 'MOCK', as_of: MOCK.prices.as_of };
    });
    return out;
  }
  // 현재가 직접 입력 (시세가 없는 종목용, 예: 잡주). 실제 시세가 있으면 시세가 우선. price=null 이면 삭제
  async function setManualPrice(instrumentId, price) {
    const inst = state.instruments.find(i => i.id === instrumentId);
    if (!inst) throw fail('종목을 찾을 수 없습니다.');
    if (price === null || price === '') delete state.manualPrices[instrumentId];
    else {
      const v = Number(String(price).replace(/[,\s₩$]/g, ''));
      if (!(v > 0)) throw fail('현재가는 0보다 큰 숫자로 입력해 주세요.');
      state.manualPrices[instrumentId] = { price: v, as_of: nowISO() };
    }
    commit();
  }
  async function getManualPrice(instrumentId) {
    return state.manualPrices[instrumentId] ? clone(state.manualPrices[instrumentId]) : null;
  }
  async function getPrices() {
    const meta = await getPriceMeta();
    return Object.fromEntries(Object.entries(meta).map(([id, m]) => [id, m.price]));
  }
  async function getFxRate() {
    const L = await loadLive();
    const f = L && L.fx['USD/KRW'];
    return f ? { pair: 'USD/KRW', rate: f.rate, as_of: f.as_of, source: f.source } : { ...MOCK.fx, source: 'MOCK' };
  }
  // 화면 표시용: 현재가가 언제 기준인지, 실시세/예시 가격 종목 수, 마지막 갱신 결과
  async function getPriceStatus() {
    const L = await loadLive();
    const meta = await getPriceMeta();
    const held = new Set(state.holdings.map(h => h.instrument_id));
    let liveCount = 0, mockCount = 0, missing = 0, latest = null;
    state.instruments.filter(i => held.has(i.id) && i.asset_type !== 'CASH').forEach(i => {
      const m = meta[i.id];
      if (!m) missing++;
      else if (m.source === 'MOCK') mockCount++;
      else { liveCount++; if (!latest || m.as_of > latest) latest = m.as_of; }
    });
    const fx = await getFxRate();
    return { ok: !!(L && L.ok), error: L && L.error, latestAsOf: latest, fx, run: L && L.run, liveCount, mockCount, missing };
  }
  // QQQ 200일선 신호: 최신 현재가(prices) vs 200일 이동평균(indicators)
  //   zone: 'above' = 200일선 +1% 이상 / 'below' = −1% 이하 / 'between' = 그 사이
  // 일별 USD/KRW 환율 (DB fx_daily, 최근 5년) — 투자 화면의 기간 평균·차트용. 10분 동안 다시 읽지 않음
  let fxHistCache = null;
  async function getFxHistory() {
    if (!SB || !SB.url) return [];
    if (fxHistCache && Date.now() - fxHistCache.t < 10 * 60 * 1000) return fxHistCache.rows;
    const from = Fmt.addDays(Fmt.todayKST(), -(366 * 5 + 10));
    let rows = [];
    for (let off = 0; ; off += 1000) { // 서버가 한 번에 1000행까지 주므로 나눠서 읽음
      const page = await sbGet(`fx_daily?select=date,close&pair=eq.${encodeURIComponent('USD/KRW')}&date=gte.${from}&order=date.asc&offset=${off}&limit=1000`);
      rows = rows.concat(page);
      if (page.length < 1000) break;
    }
    rows = rows.map(r => ({ date: r.date, close: Number(r.close) }));
    fxHistCache = { t: Date.now(), rows };
    return rows;
  }
  async function getQqqSignal() {
    if (!SB || !SB.url) return null;
    try {
      const [ind, px] = await Promise.all([
        sbGet('indicators?select=value,period,last_close,last_close_date,source,as_of&key=eq.QQQ_SMA200'),
        sbGet('prices?select=price,source,as_of&symbol=eq.QQQ&exchange=eq.NASDAQ')
      ]);
      const sma = ind[0] ? Number(ind[0].value) : null;
      const price = px[0] ? Number(px[0].price) : ind[0] ? Number(ind[0].last_close) : null;
      if (!sma || !price) return null;
      const diffPct = (price / sma - 1) * 100;
      return {
        price, priceSource: px[0] ? px[0].source : ind[0].source, priceAsOf: px[0] ? px[0].as_of : ind[0].as_of,
        sma, period: ind[0].period, smaSource: ind[0].source, smaDate: ind[0].last_close_date, smaAsOf: ind[0].as_of,
        diffPct, zone: diffPct >= 1 ? 'above' : diffPct <= -1 ? 'below' : 'between'
      };
    } catch (e) { return null; }
  }
  // [↻ 시세 갱신] 버튼: 서버 함수를 바로 실행하고 새 가격을 다시 읽습니다 (QQQ 200일선 지표도 함께 갱신)
  async function refreshPrices() {
    fetch(`${SB.url}/functions/v1/update-indicators`, { method: 'POST', headers: { apikey: SB.key } }).catch(() => {});
    const r = await fetch(`${SB.url}/functions/v1/update-prices?trigger=manual`, { method: 'POST', headers: { apikey: SB.key } });
    const body = await r.json().catch(() => ({ ok: false, message: 'HTTP ' + r.status }));
    await loadLive(true);
    listeners.forEach(fn => fn());
    return body;
  }

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
    if (state.accounts.some(x => x.id !== exceptId && x.name === name && x.broker_id === a.broker_id)) throw fail('같은 증권사에 같은 이름의 계좌가 이미 있습니다.'); // 증권사가 다르면 같은 이름 허용
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
  // ---------------------------------------------------------------
  // 투자 목표 비중 (기준 = 예: '200일선 +1% 이상', 기준마다 자산군별 목표 %)
  // ---------------------------------------------------------------
  const sumWeights = w => Groups.codes.reduce((s, c) => s + (Number(w[c]) || 0), 0);
  function normalizeWeights(w) {
    const out = {};
    Groups.codes.forEach(c => {
      const v = Number(w && w[c] !== '' && w[c] != null ? w[c] : 0);
      if (!(v >= 0 && v <= 100)) throw fail(`${Groups.name(c)} 목표 비중은 0~100 사이 숫자여야 합니다.`);
      out[c] = Math.round(v * 100) / 100;
    });
    return out;
  }
  async function getTargetPlans() {
    return clone(state.targets).map(p => ({ ...p, sum: Math.round(sumWeights(p.weights) * 100) / 100 }));
  }
  // 기준 추가·수정 (이름 + 자산군별 목표 %)
  async function saveTargetPlan(plan) {
    const name = String(plan.name || '').trim();
    if (!name) throw fail('기준 이름을 입력해 주세요.');
    if (state.targets.some(p => p.id !== plan.id && p.name === name)) throw fail('같은 이름의 기준이 이미 있습니다.');
    const weights = normalizeWeights(plan.weights);
    const old = state.targets.find(p => p.id === plan.id);
    if (old) Object.assign(old, { name, weights });
    else state.targets.push({ id: uid('tgt'), name, weights });
    commit();
  }
  // 한 자산군의 목표 %를 기준별로 한 번에 수정: values = { 기준id: % }
  async function setGroupTargets(code, values) {
    if (!Groups.codes.includes(code)) throw fail('알 수 없는 자산군입니다.');
    const next = state.targets.map(p => {
      const v = values[p.id];
      return v === undefined ? p : { ...p, weights: normalizeWeights({ ...p.weights, [code]: v }) };
    });
    state.targets = next;
    commit();
  }
  async function deleteTargetPlan(id) {
    state.targets = state.targets.filter(p => p.id !== id);
    commit();
  }
  async function resetTargetPlans() {
    state.targets = clone(DEFAULT_TARGETS);
    commit();
  }

  // ---------------------------------------------------------------
  // 자산군 (추가 · 이름/색 수정 · 순서 · 삭제). 기타종목은 미지정 종목이 모이는 곳이라 삭제 불가
  // ---------------------------------------------------------------
  const GROUP_COLORS = ['#7f97a8', '#d9434f', '#2f6fdf', '#17a589', '#8e5cc4', '#c9a227', '#ef7d22', '#e05e9b', '#3aa6c9', '#6c8a2e', '#a0522d', '#5b6ee1'];
  async function getGroups() {
    return clone(state.groups).map(g => ({ ...g, count: state.instruments.filter(i => i.asset_group === g.code).length }));
  }
  function groupCheck(name, color, exceptCode) {
    name = String(name || '').trim();
    if (!name) throw fail('자산군 이름을 입력해 주세요.');
    if (name.length > 20) throw fail('자산군 이름은 20자 이내로 입력해 주세요.');
    if (state.groups.some(g => g.code !== exceptCode && g.name === name)) throw fail('같은 이름의 자산군이 이미 있습니다.');
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw fail('색상 값이 올바르지 않습니다.');
    return name;
  }
  async function addGroup({ name, color }) {
    name = groupCheck(name, color);
    let code;
    do { code = 'G_' + Math.random().toString(36).slice(2, 8).toUpperCase(); } while (state.groups.some(g => g.code === code));
    const used = state.groups.map(g => g.color);
    const g = { code, name, color: color || GROUP_COLORS.find(c => !used.includes(c)) || '#888888' };
    state.groups.push(g);
    state.targets.forEach(p => { p.weights[code] = 0; }); // 기준별 목표 비중은 0%로 시작
    commit();
    return clone(g);
  }
  async function updateGroup(code, { name, color }) {
    const g = state.groups.find(x => x.code === code);
    if (!g) throw fail('자산군을 찾을 수 없습니다.');
    g.name = groupCheck(name ?? g.name, color, code);
    if (color) g.color = color;
    commit();
    return clone(g);
  }
  async function moveGroup(code, dir) {
    const i = state.groups.findIndex(x => x.code === code), j = i + dir;
    if (i < 0 || j < 0 || j >= state.groups.length) return;
    [state.groups[i], state.groups[j]] = [state.groups[j], state.groups[i]];
    commit();
  }
  // 삭제: 이 자산군 종목은 미지정(기타종목 집계)으로, 기준별 목표 비중에서는 이 자산군 몫이 빠짐. 지난 이력은 기타종목으로 합쳐 표시
  async function deleteGroup(code) {
    if (code === Groups.FALLBACK) throw fail('기타종목은 미지정 종목이 모이는 자산군이라 삭제할 수 없습니다.');
    if (!state.groups.some(g => g.code === code)) throw fail('자산군을 찾을 수 없습니다.');
    const now = nowISO();
    state.instruments.forEach(i => { if (i.asset_group === code) { i.asset_group = null; i.updated_at = now; } });
    state.targets.forEach(p => { delete p.weights[code]; });
    state.groups = state.groups.filter(g => g.code !== code);
    Groups.set(state.groups);
    markChanged(false); commit();
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
  // 전체 종목 목록 (DB securities, 약 17,000개) — 매월 1일 서버(sync-securities)가 외부에서 받아 갱신
  //   국내 주식 KIND · 국내 ETF 네이버 · 미국 NASDAQ Trader · 업비트
  // DB 에 연결할 수 없으면(오프라인·자체 점검) mock/catalog.js 의 예시 목록을 씁니다.
  // ---------------------------------------------------------------
  const catalogKey = x => instKey(x.symbol, x.exchange);
  const useDb = () => !!(SB && SB.url);
  const SEC_COLS = 'symbol,exchange,name,eng_name,asset_type,currency,market,listed';
  // 심볼 목록으로 종목 조회 (100개씩 나눠서)
  async function lookupSecurities(symbols) {
    const uniq = [...new Set((symbols || []).map(s => String(s).trim().toUpperCase()).filter(Boolean))];
    if (!useDb()) return MOCK.catalog.items.filter(c => uniq.includes(c.symbol.toUpperCase()));
    const out = [];
    for (let i = 0; i < uniq.length; i += 100) {
      const part = uniq.slice(i, i + 100).map(s => '"' + s.replace(/"/g, '') + '"').join(',');
      out.push(...await sbGet(`securities?select=${SEC_COLS}&symbol=in.(${encodeURIComponent(part)})`));
    }
    return out;
  }
  // 전체 목록 (엑셀 '종목목록' 시트용). 한 번 받으면 페이지를 닫을 때까지 재사용
  let allSecCache = null;
  async function allSecurities() {
    if (!useDb()) return MOCK.catalog.items;
    if (allSecCache) return allSecCache;
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const part = await sbGet(`securities?select=symbol,exchange,name,eng_name,asset_type,currency&listed=is.true&order=exchange.asc,symbol.asc&limit=1000&offset=${offset}`);
      out.push(...part);
      if (part.length < 1000) break;
    }
    return (allSecCache = out);
  }
  async function sbCount(path) {
    const r = await fetch(`${SB.url}/rest/v1/${path}`, { method: 'HEAD', headers: { apikey: SB.key, Prefer: 'count=exact' } });
    const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
    return m ? +m[1] : null;
  }
  // 다음 정기 갱신 = 다음 달 1일 09:00 KST (서버 cron: 매월 1일 00:00 UTC)
  function nextMonthlySync() {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1, 0, 0)).toISOString();
  }
  async function getCatalogInfo() {
    if (!useDb()) {
      const syncedAt = state.meta.catalogSyncedAt || MOCK.catalog.synced_at;
      const next = new Date(syncedAt);
      next.setMonth(next.getMonth() + 1);
      return { count: MOCK.catalog.items.length, syncedAt, nextSyncAt: next.toISOString(), source: 'MOCK' };
    }
    try {
      const [runs, count] = await Promise.all([
        sbGet('securities_runs?select=finished_at,message,counts&finished_at=not.is.null&order=finished_at.desc&limit=1'),
        sbCount('securities?select=symbol&listed=is.true')
      ]);
      return { count: count ?? 0, syncedAt: runs[0] ? runs[0].finished_at : null, nextSyncAt: nextMonthlySync(), message: runs[0] && runs[0].message, source: 'DB' };
    } catch (e) {
      return { count: 0, syncedAt: null, nextSyncAt: nextMonthlySync(), message: '종목 목록 DB 에 연결하지 못했습니다', source: 'ERROR' };
    }
  }
  // 등록된 종목의 이름을 최신 목록 이름으로 맞춤 (심볼+거래소가 같은 종목만)
  //  - 국내(KRX)·업비트: 한글 이름을 새 이름으로 바꿈
  //  - 미국: 목록 이름이 영문이므로, 직접 붙인 한글 이름은 그대로 두고 영문명(eng_name)만 갱신
  async function applyCatalogNames() {
    const regs = state.instruments.filter(i => i.asset_type !== 'CASH');
    const secs = await lookupSecurities(regs.map(i => i.symbol));
    const byKey = new Map(secs.map(c => [catalogKey(c), c]));
    const renamed = [];
    regs.forEach(inst => {
      const c = byKey.get(catalogKey(inst));
      if (!c) return;
      const koreanList = !useDb() || ['KRX', 'UPBIT'].includes(inst.exchange);
      let changed = false;
      if (koreanList && c.name && c.name !== inst.name) {
        renamed.push({ symbol: inst.symbol, exchange: inst.exchange, from: inst.name, to: c.name });
        inst.name = c.name; changed = true;
      }
      if (c.eng_name && c.eng_name !== inst.eng_name) { inst.eng_name = c.eng_name; changed = true; }
      if (changed) inst.updated_at = nowISO();
    });
    return renamed;
  }
  // [↻ 목록 최신화]: 서버에서 외부 목록을 지금 다시 받고(10분에 1번), 등록 종목 이름을 맞춥니다
  async function syncCatalog() {
    if (useDb()) {
      const r = await fetch(`${SB.url}/functions/v1/sync-securities?trigger=manual`, { method: 'POST', headers: { apikey: SB.key } });
      const body = await r.json().catch(() => ({ ok: false, message: 'HTTP ' + r.status }));
      if (!body.ok) throw fail(body.message || '종목 목록을 최신화하지 못했습니다.');
      allSecCache = null;
    }
    const renamed = await applyCatalogNames();
    const info = await getCatalogInfo();
    state.meta.catalogSyncedAt = info.syncedAt || nowISO();
    commit({ auto: true });
    return { ...info, renamed };
  }
  // 페이지를 열 때: 서버의 정기 갱신(매월) 이후 처음이면 등록 종목 이름을 새 이름으로 맞춤
  async function autoSyncCatalogIfDue() {
    const info = await getCatalogInfo();
    if (!useDb()) return new Date() >= new Date(info.nextSyncAt) ? syncCatalog() : null;
    if (!info.syncedAt || info.syncedAt === state.meta.catalogSyncedAt) return null;
    const renamed = await applyCatalogNames();
    state.meta.catalogSyncedAt = info.syncedAt;
    commit({ auto: true });
    return { ...info, renamed };
  }
  // 종목 검색: 이미 등록된 종목(registered) + 전체 종목 목록에서 찾은 종목
  async function searchCatalog(q) {
    const s = String(q || '').trim();
    const low = s.toLowerCase();
    const match = x => !low || [x.name, x.symbol, x.eng_name].some(v => String(v || '').toLowerCase().includes(low));
    const regKeys = new Set(state.instruments.map(catalogKey));
    const list = state.instruments.filter(match).map(i => ({ ...clone(i), registered: true }));
    let found;
    if (!useDb()) found = MOCK.catalog.items.filter(match);
    else if (!s) found = []; // 검색어가 없으면 등록된 종목만
    else {
      const term = s.replace(/[%,()*"\\]/g, ' ').trim();
      const pat = encodeURIComponent(`*${term}*`);
      found = term ? await sbGet(`securities?select=${SEC_COLS}&listed=is.true&or=(symbol.ilike.${pat},name.ilike.${pat},eng_name.ilike.${pat})&limit=80`) : [];
      // 심볼이 정확히 같은 종목 → 심볼이 검색어로 시작 → 이름에 포함 순서
      const up = term.toUpperCase();
      const rank = x => (x.symbol.toUpperCase() === up ? 0 : x.symbol.toUpperCase().startsWith(up) ? 1 : String(x.name).toUpperCase().startsWith(up) ? 2 : 3);
      found.sort((a, b) => rank(a) - rank(b) || String(a.name).length - String(b.name).length);
    }
    found.filter(x => !regKeys.has(catalogKey(x))).slice(0, 60)
      .forEach(x => list.push({ ...x, id: null, asset_group: null, registered: false }));
    return list;
  }
  // 검색 결과에서 고른 종목이 아직 등록 전이면 종목 마스터에 등록하고 돌려줍니다. (시세 대상에도 추가)
  async function ensureInstrument(entry) {
    if (entry.id) return clone(state.instruments.find(i => i.id === entry.id));
    const found = state.instruments.find(i => catalogKey(i) === catalogKey(entry));
    if (found) return clone(found);
    const inst = await addInstrument({ name: entry.name, eng_name: entry.eng_name, symbol: entry.symbol, exchange: entry.exchange, asset_type: entry.asset_type, currency: entry.currency, asset_group: null });
    trackInstruments([inst]);
    return inst;
  }
  // 서버에 '이 종목들 현재가가 필요하다'고 알림 → 시세 대상에 추가 (전체 종목 목록에 있는 종목만 받아들여짐)
  function trackInstruments(list) {
    if (!useDb()) return;
    const items = (list || state.instruments).filter(i => i.asset_type !== 'CASH').map(i => ({ symbol: i.symbol, exchange: i.exchange }));
    if (!items.length) return;
    fetch(`${SB.url}/functions/v1/update-prices?track=1`, {
      method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ items })
    }).catch(() => { /* 다음 접속 때 다시 알림 */ });
  }
  // 페이지를 열 때 하루 한 번 등록 종목 전체를 알림 (오래 안 쓰인 종목은 서버가 45일 뒤 제외)
  function trackDaily() {
    try {
      const key = 'myAsset.trackedOn', today = Fmt.todayKST();
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch (e) { /* 저장소를 못 쓰면 매번 알림 */ }
    trackInstruments();
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

  // 종목 속성 한꺼번에 변경: 자산군 · 추종 통화 · 자산 성향 (undefined = 그대로, null/'' = 기본값/미지정)
  async function updateInstrumentAttrs(id, { asset_group, track_currency, style }) {
    const inst = state.instruments.find(x => x.id === id);
    if (!inst) throw fail('종목을 찾을 수 없습니다.');
    if (asset_group !== undefined) {
      if (asset_group && !Groups.has(asset_group)) throw fail('알 수 없는 자산군입니다.');
      inst.asset_group = asset_group || null;
    }
    if (track_currency !== undefined) {
      if (track_currency && !TrackCur.list.some(t => t.code === track_currency)) throw fail('알 수 없는 추종 통화입니다.');
      inst.track_currency = track_currency && track_currency !== inst.currency ? track_currency : null; // 거래 통화와 같으면 비워 둠
    }
    if (style !== undefined) {
      const s = style ? Styles.normalize(style) : null;
      if (style && !s) throw fail('자산 성향 값이 올바르지 않습니다. (혼합은 성장 1~99%)');
      inst.style = s;
    }
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
      lastSnapshot: last ? { date: last.snapshot_date, time: last.snapshot_time, simulated: !!last.simulated, initial: !!last.initial } : null,
      realHistory: !!state.meta.realHistory,
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
      inv += r.invK; val += r.valK; const g = Groups.of(it); gv[g] += r.valK; gi[g] += r.invK;
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
      // 실제 이력 모드: Mock 예시 이력 없이, 저장된 스냅샷(최초 데이터 + 매일 08:00)만 사용
      baseCache = { lastDate: last, list: state.meta.realHistory ? [] : MOCK.buildBaseSnapshots(last, makeSnapshot) };
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
  async function createDailySnapshot(date, { real = false, initial = false } = {}) {
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
    snap.snapshot.simulated = !real;
    if (initial) { // 이력의 시작점 (최초 데이터) — 시각 대신 '최초'로 표시
      snap.snapshot.initial = true;
      snap.snapshot.snapshot_time = '최초';
    }
    state.extraSnapshots.push(snap);
    state.meta.changedSinceSnapshot = false;
    state.meta.importBackup = null; // 되돌리기는 다음 스냅샷 전까지만
    commit();
    return clone(snap.snapshot);
  }
  // 이력 초기화: 예시(Mock) 이력과 지난 스냅샷을 모두 지우고, 지금 현황을 기준일 날짜의 '최초 데이터'로 저장
  async function startRealHistory() {
    state.meta.realHistory = true;
    state.extraSnapshots = [];
    baseCache = null; snapCache = null;
    return createDailySnapshot(state.meta.baseDate || Fmt.todayKST(), { real: true, initial: true }); // 날짜 = 현황 기준일 (업로드 파일의 기준일자)
  }
  // 매일 08:00 스냅샷 (실제 이력 모드): 화면을 열었을 때 마지막 08:00 스냅샷이 없으면 지금 현황으로 저장
  // (지나간 날짜는 그때의 보유를 알 수 없어 만들지 않음)
  // 로그인 후 화면을 열 때: 실제 데이터인데 아직 예시 이력을 쓰고 있으면 이력 초기화(최초 데이터 저장), 아니면 08:00 스냅샷 확인
  async function ensureHistory() {
    if (!state.meta.realHistory && !isPristine()) return { started: await startRealHistory() };
    return { daily: await autoDailySnapshot() };
  }
  async function autoDailySnapshot() {
    if (!state.meta.realHistory) return null;
    const list = allSnapshots(), target = scheduledLastDate();
    const last = list.length ? list[list.length - 1].snapshot.snapshot_date : null;
    if (last && last >= target) return null;
    return createDailySnapshot(target, { real: true });
  }

  // ---------------------------------------------------------------
  // XLSX 업로드 / 다운로드 (브라우저에서만 처리 — 서버 전송 없음)
  // - 읽기: SheetJS
  // - 내려받기: ExcelJS — 증권사·계좌종류 드롭다운, 심볼을 치면 종목명·거래소·자산유형·통화 자동 입력(수식)
  // - 업로드 점검: 심볼·종목 정보·증권사·계좌종류가 DB 와 하나라도 다르면 오류 → 반영하지 않음
  // ---------------------------------------------------------------
  const HEADERS = MOCK.xlsxSamples.headers; // 계좌명, 증권사, 계좌종류, 심볼, 종목명, 거래소, 자산유형, 통화, 수량, 평균매입가, 매입평균환율, 비고
  const REQUIRED_HEADERS = ['계좌명', '증권사', '심볼', '수량', '평균매입가', '매입평균환율'];
  const AUTO_COLS = { '종목명': 2, '거래소': 3, '자산유형': 4, '통화': 5 }; // 심볼로 자동 입력되는 칸 → 종목목록 시트의 열 번호
  const EXTRA_ROWS = 200; // 내려받은 파일에 새 종목을 적을 수 있도록 미리 준비하는 빈 줄 수
  // 내려받는 엑셀 머리글에 붙는 도움말 (셀에 마우스를 올리면 보임)
  const JUNK_SYMBOL = '999999'; // 잡주: 자잘한 국내 주식을 한 줄로 묶은 종목 (수량 1, 현재가는 직접 입력)
  const HEADER_NOTES = {
    '증권사': '목록에서 고릅니다 (선택목록 시트 = 증권 마스터).',
    '계좌종류': '목록에서 고릅니다. 비우면 같은 이름 계좌의 기존 값을 유지합니다.',
    '심볼': '종목코드를 입력하면 종목명·거래소·자산유형·통화가 자동으로 채워집니다 (종목목록 시트 참고).',
    '수량': '0보다 큰 숫자. 현금은 금액을 수량에 적습니다.\n잡주(999999)는 1만 입력할 수 있습니다.',
    '평균매입가': '원본통화 기준 평균단가.\n현금은 1만 입력할 수 있습니다.',
    '매입평균환율': 'USD 종목: 달러를 산 평균환율 (필수, 0보다 큼).\nKRW 종목: 비우거나 1 (다른 값을 적어도 업로드 시 경고 후 1로 바꿔 반영).'
  };
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

  // DB 기준 종목 정보 = 등록된 종목 + 전체 종목 목록 (심볼+거래소 기준 중복 제거, 등록된 종목 우선)
  // symbols 를 주면 그 심볼만 조회(업로드 점검), 생략하면 전체 목록(엑셀 종목목록 시트)
  async function symbolRefs(symbols) {
    const map = new Map();
    state.instruments.forEach(i => map.set(catalogKey(i), { id: i.id, symbol: i.symbol, exchange: i.exchange, name: i.name, asset_type: i.asset_type, currency: i.currency, eng_name: i.eng_name }));
    const secs = symbols ? await lookupSecurities(symbols) : await allSecurities();
    secs.forEach(c => {
      const k = catalogKey(c);
      if (!map.has(k)) map.set(k, { id: null, symbol: c.symbol, exchange: c.exchange, name: c.name, asset_type: c.asset_type, currency: c.currency, eng_name: c.eng_name });
    });
    return [...map.values()];
  }

  async function parseHoldingsXlsx(file) {
    const res = { fileName: file.name, baseDate: null, rows: [], fileErrors: [] };
    const E = (col, value, reason) => res.fileErrors.push({ row: '-', col, value: String(value ?? ''), expected: '', reason });
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
    const header = (aoa[0] || []).map(h => String(h).replace(/\(자동\)/, '').trim());
    const missing = REQUIRED_HEADERS.filter(h => !header.includes(h));
    if (missing.length) { E('헤더', missing.join(', '), '필수 헤더 누락'); return res; }
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i] || [];
      const raw = {};
      HEADERS.forEach(h => { const idx = header.indexOf(h); raw[h] = idx >= 0 ? line[idx] : ''; });
      // 사용자가 입력하는 칸이 모두 비어 있으면 빈 줄 (자동 입력 칸은 수식이라 무시)
      if (HEADERS.filter(h => !(h in AUTO_COLS)).every(h => String(raw[h] ?? '').trim() === '')) continue;
      res.rows.push({ rowNo: i + 1, raw });
    }
    if (!res.rows.length) E('보유', '', '데이터 행이 0건입니다');
    return res;
  }

  async function validateImport(parsed) {
    const errors = [...parsed.fileErrors], warnings = [];
    const add = (list, row, col, value, reason, expected) => list.push({ row, col, value: String(value ?? ''), expected: String(expected ?? ''), reason });
    const today = Fmt.todayKST();
    if (parsed.baseDate) {
      if (parsed.baseDate > today) add(errors, '-', '기준일자', parsed.baseDate, '기준일자가 오늘(KST) 이후입니다');
      else {
        if (parsed.baseDate !== today) add(warnings, '-', '기준일자', parsed.baseDate, '기준일자가 오늘과 다릅니다');
        if (parsed.baseDate < state.meta.baseDate) add(warnings, '-', '기준일자', parsed.baseDate, `기준일자가 현재 현황의 기준일(${state.meta.baseDate})보다 이전입니다`);
      }
    }
    const fileSymbols = parsed.rows.flatMap(({ raw }) => { const s = String(raw['심볼'] ?? '').trim().toUpperCase(); return /^\d{1,5}$/.test(s) ? [s, s.padStart(6, '0')] : [s]; });
    let refs;
    try { refs = await symbolRefs(fileSymbols); }
    catch (e) { refs = await symbolRefs([]); errors.push({ row: '-', col: '심볼', value: '', expected: '', reason: '종목 목록 DB 에 연결하지 못해 등록된 종목만 확인했습니다: ' + e.message }); }
    const brokerNames = state.brokers.map(b => b.name), typeNames = state.accountTypes.map(t => t.name);
    const rows = [], seen = {}, accInfo = {}, newSeen = {};

    parsed.rows.forEach(({ rowNo, raw }) => {
      const s = h => String(raw[h] ?? '').trim();
      const err = (col, reason, expected, value) => add(errors, rowNo, col, value !== undefined ? value : raw[col], reason, expected);
      const warn = (col, reason, value) => add(warnings, rowNo, col, value !== undefined ? value : raw[col], reason);

      // 1) 계좌: 증권사·계좌종류는 증권 마스터(DB)에 있는 값만
      const acc = s('계좌명'), broker = s('증권사'), accType = s('계좌종류'), memo = s('비고');
      if (!acc) err('계좌명', '필수 값이 비어 있습니다');
      if (!broker) err('증권사', '필수 값이 비어 있습니다');
      else if (!brokerNames.includes(broker)) err('증권사', 'DB(증권 마스터)에 없는 증권사입니다', brokerNames.join(', '));
      if (accType && !typeNames.includes(accType)) err('계좌종류', 'DB(증권 마스터)에 없는 계좌종류입니다', typeNames.join(', '));
      // 계좌는 계좌명 + 증권사로 구분 (증권사가 다르면 같은 계좌명도 다른 계좌)
      if (acc && broker) {
        const a = accInfo[acc + '|' + broker];
        if (!a) accInfo[acc + '|' + broker] = { broker, accType, row: rowNo };
        else {
          if (accType && a.accType && a.accType !== accType) err('계좌종류', `같은 계좌(${broker} ${acc})에 계좌종류가 다릅니다`, `${a.row}행: ${a.accType}`);
          if (!a.accType && accType) a.accType = accType;
        }
      }

      // 2) 종목: 심볼(+거래소)로 DB 종목을 찾고, 종목명·거래소·자산유형·통화가 DB 와 같은지 확인
      let symbol = s('심볼').toUpperCase();
      const exIn = s('거래소').toUpperCase();
      if (/^\d{1,5}$/.test(symbol) && (!exIn || exIn === 'KRX')) symbol = symbol.padStart(6, '0'); // 엑셀이 005930 → 5930 으로 바꾼 경우
      let ref = null;
      if (!symbol) err('심볼', '필수 값이 비어 있습니다');
      else {
        const cands = refs.filter(r => r.symbol.toUpperCase() === symbol);
        const hit = exIn ? cands.filter(r => r.exchange === exIn) : cands;
        if (!cands.length) err('심볼', 'DB(종목 마스터·전체 상장 종목 목록)에 없는 심볼입니다', '종목목록 시트 참고', symbol);
        else if (!hit.length) err('거래소', '이 심볼의 거래소가 DB와 다릅니다', cands.map(r => r.exchange).join(', '));
        else if (hit.length > 1) err('거래소', '같은 심볼이 여러 거래소에 있습니다. 거래소를 입력해 주세요', hit.map(r => r.exchange).join(', '));
        else ref = hit[0];
      }
      if (ref) {
        // 비어 있으면 DB 값을 쓰고, 값이 있는데 DB 와 다르면 오류
        [['종목명', 'name', false], ['자산유형', 'asset_type', true], ['통화', 'currency', true]].forEach(([col, f, upper]) => {
          let v = s(col);
          if (!v || v === '(목록에 없음)') return;
          if (upper) v = v.toUpperCase();
          if (v !== ref[f]) err(col, 'DB 값과 다릅니다', ref[f]);
        });
        const k = catalogKey(ref);
        if (!ref.id && !newSeen[k]) { newSeen[k] = true; warn('심볼', '전체 상장 종목 목록에 있는 종목이라 종목 마스터에 새로 등록됩니다', `${ref.symbol}/${ref.exchange} ${ref.name}`); }
        if (acc) {
          const dk = acc + '|' + broker + '|' + k;
          if (seen[dk]) err('심볼', `같은 계좌에 같은 종목이 중복됩니다 (${seen[dk]}행과 중복)`, '', `${ref.symbol}/${ref.exchange}`);
          else seen[dk] = rowNo;
        }
      }

      // 3) 숫자: 수량·평균매입가·매입평균환율 (통화·현금 여부는 DB 종목 기준)
      const currency = ref ? ref.currency : '';
      const isCash = ref ? ref.asset_type === 'CASH' : false;
      const numCheck = (col, v, rule, ruleMsg) => {
        if (v === null) err(col, '필수 값이 비어 있습니다');
        else if (isNaN(v)) err(col, '숫자가 아닙니다');
        else if (!rule(v)) err(col, ruleMsg);
      };
      const q = cleanNum(raw['수량']);
      numCheck('수량', q, v => v > 0, '수량은 0보다 커야 합니다');
      if (ref && ref.exchange === 'KRX' && ref.symbol === JUNK_SYMBOL && q !== null && !isNaN(q) && q !== 1) err('수량', '잡주(999999)의 수량은 1만 입력할 수 있습니다', '1');
      const ap = cleanNum(raw['평균매입가']);
      if (!isCash) numCheck('평균매입가', ap, v => v >= 0, '평균매입가는 0 이상이어야 합니다');
      if (isCash && ap !== null && ap !== 1) warn('평균매입가', '현금 행의 평균매입가는 1로 바꿔서 반영합니다');
      const fxv = cleanNum(raw['매입평균환율']);
      if (currency === 'USD') {
        if (fxv === null) err('매입평균환율', 'USD 종목은 매입평균환율이 필요합니다');
        else if (isNaN(fxv)) err('매입평균환율', '숫자가 아닙니다');
        else if (fxv <= 0) err('매입평균환율', '매입평균환율은 0보다 커야 합니다');
      } else if (currency === 'KRW' && fxv !== null && (isNaN(fxv) || fxv !== 1)) {
        warn('매입평균환율', 'KRW 종목의 매입평균환율은 1로 바꿔서 반영합니다');
      }

      rows.push({
        rowNo, account: acc, broker, accType, memo,
        symbol: ref ? ref.symbol : symbol, exchange: ref ? ref.exchange : exIn, name: ref ? ref.name : s('종목명'), eng_name: ref ? ref.eng_name || '' : '',
        asset_type: ref ? ref.asset_type : '', currency,
        quantity: q, avg_price: isCash ? 1 : ap, avg_fx_rate: currency === 'USD' ? fxv : 1,
        existingId: ref ? ref.id : null
      });
    });
    return { fileName: parsed.fileName, baseDate: parsed.baseDate, errors, warnings, rows };
  }

  function buildImportState(v) {
    const now = nowISO();
    const instruments = clone(state.instruments);
    const byKey = Object.fromEntries(instruments.map(i => [instKey(i.symbol, i.exchange), i]));
    const accounts = [], accByKey = {}, holdings = [];
    v.rows.forEach(r => {
      const k = instKey(r.symbol, r.exchange);
      let inst = byKey[k];
      if (!inst) { // 외부 종목 목록에 있는 종목 → 종목 마스터에 등록 (자산군은 미지정)
        inst = { id: uid('ins'), user_id: USER, name: r.name, eng_name: r.eng_name || '', symbol: r.symbol, exchange: r.exchange, asset_type: r.asset_type, currency: r.currency, asset_group: null, created_at: now, updated_at: now };
        instruments.push(inst);
        byKey[k] = inst;
      }
      // 업로드 화면 [자산군 지정]에서 고른 자산군 (반영할 때 종목 마스터에 적용)
      if (v.groupMap && k in v.groupMap) {
        const g = v.groupMap[k] && Groups.has(v.groupMap[k]) ? v.groupMap[k] : null;
        if (inst.asset_group !== g) { inst.asset_group = g; inst.updated_at = now; }
      }
      // 계좌 = 계좌명 + 증권사
      const ak = r.account + '|' + r.broker, brokerId = (state.brokers.find(b => b.name === r.broker) || {}).id || null;
      const same = x => x.account === r.account && x.broker === r.broker;
      let acc = accByKey[ak];
      if (!acc) {
        const old = state.accounts.find(a => a.name === r.account && a.broker_id === brokerId);
        const fileType = v.rows.find(x => same(x) && x.accType);
        const fileMemo = v.rows.find(x => same(x) && x.memo);
        acc = {
          id: old ? old.id : uid('acc'), user_id: USER, name: r.account,
          broker_id: brokerId,
          account_type_id: fileType ? (state.accountTypes.find(t => t.name === fileType.accType) || {}).id || null : old ? old.account_type_id : null,
          memo: fileMemo ? fileMemo.memo : old ? old.memo || '' : '',
          created_at: old ? old.created_at : now, updated_at: now
        };
        accounts.push(acc);
        accByKey[ak] = acc;
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
    // 파일에 나오는 종목 목록 (자산군 지정 팝업용): 새 종목 여부 + 반영 후 자산군
    const known = new Set(state.instruments.map(i => instKey(i.symbol, i.exchange)));
    const seenK = new Set(), fileInsts = [];
    v.rows.forEach(r => {
      const k = instKey(r.symbol, r.exchange);
      if (seenK.has(k)) return;
      seenK.add(k);
      const inst = s.instruments.find(i => instKey(i.symbol, i.exchange) === k);
      const old = state.instruments.find(i => instKey(i.symbol, i.exchange) === k);
      fileInsts.push({ key: k, name: inst.name, symbol: inst.symbol, exchange: inst.exchange, currency: inst.currency, asset_type: inst.asset_type,
        isNew: !known.has(k), group: inst.asset_group || null, oldGroup: old ? old.asset_group || null : null,
        holdCount: s.holdings.filter(h => h.instrument_id === inst.id).length });
    });
    return { ...s, accounts, fileInsts, baseDate: v.baseDate, fx, model: Calc.buildModel({ ...s, accounts, prices, fx }) };
  }
  // 현재 계좌·보유 전체를 파일 내용으로 교체 (전부 반영 또는 전부 취소). 오류가 1건이라도 있으면 반영하지 않음
  async function replaceCurrentHoldings(v) {
    if (!v || v.errors.length) throw fail('DB 정보와 다른 값이 있어 반영할 수 없습니다.');
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
    trackInstruments();
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

  // 현재 계좌·보유 → 엑셀 행 (HEADERS 순서)
  function currentRows() {
    const instMap = Object.fromEntries(state.instruments.map(i => [i.id, i]));
    const rows = [];
    state.accounts.forEach(acc => {
      state.holdings.filter(h => h.account_id === acc.id).forEach(h => {
        const inst = instMap[h.instrument_id];
        rows.push([acc.name, brokerName(acc.broker_id), typeName(acc.account_type_id), inst.symbol, inst.name, inst.exchange, inst.asset_type, inst.currency,
          h.quantity, h.avg_price, inst.currency === 'USD' ? h.avg_fx_rate : '', acc.memo || '']);
      });
    });
    return rows;
  }

  // 단순 값만 담은 통합문서 (SheetJS) — 자체 점검용
  function buildWorkbook(baseDate, rows) {
    const wb = XLSX.utils.book_new();
    const info = XLSX.utils.aoa_to_sheet([['기준일자', baseDate]]);
    info['B1'] = { t: 's', v: baseDate };
    XLSX.utils.book_append_sheet(wb, info, '기준정보');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), '보유');
    return wb;
  }

  // 내려받는 엑셀 (ExcelJS): 증권사·계좌종류 드롭다운 + 심볼 → 종목 정보 자동 입력
  const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const NUM_FRAC = '#,##0.########'; // 소수 수량 (예: 0.01234567 BTC)
  // latest: 추가로 넣을 '최신 계좌현황' 시트의 행 (테스트용 샘플 파일에 지금 보유 현황을 함께 저장할 때)
  async function buildExcelBuffer(baseDate, rows, { latest = null } = {}) {
    if (!window.ExcelJS) throw fail('엑셀 라이브러리(ExcelJS)를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const wb = new ExcelJS.Workbook();
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF9' } };
    const autoFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F2F4' } };
    const bold = { bold: true };

    // 기준정보
    const info = wb.addWorksheet('기준정보');
    info.getCell('A1').value = '기준일자';
    info.getCell('B1').numFmt = '@';
    info.getCell('B1').value = baseDate;
    info.getCell('A2').value = '안내';
    info.getCell('B2').value = '업로드할 현황의 기준일입니다 (YYYY-MM-DD). 직접 바꿀 수 있습니다.';
    info.getColumn(1).width = 12; info.getColumn(2).width = 64;
    info.getCell('A1').font = bold;

    // 보유
    const ws = wb.addWorksheet('보유', { views: [{ state: 'frozen', ySplit: 1 }] });
    const col = h => HEADERS.indexOf(h) + 1;
    const head = ws.getRow(1);
    HEADERS.forEach((h, j) => {
      const c = head.getCell(j + 1);
      c.value = h in AUTO_COLS ? `${h}(자동)` : h;
      c.font = bold;
      c.fill = h in AUTO_COLS ? autoFill : headFill;
      if (HEADER_NOTES[h]) c.note = HEADER_NOTES[h];
    });
    [14, 13, 12, 12, 30, 9, 9, 7, 14, 14, 13, 34].forEach((w, j) => { ws.getColumn(j + 1).width = w; });
    const brokers = bySort(state.brokers), types = bySort(state.accountTypes);
    const symCol = colLetter(col('심볼'));
    const total = rows.length + EXTRA_ROWS;
    for (let i = 0; i < total; i++) {
      const r = i + 2, data = rows[i] || [];
      const row = ws.getRow(r);
      HEADERS.forEach((h, j) => {
        const c = row.getCell(j + 1);
        const v = data[j];
        if (h in AUTO_COLS) {
          c.value = { formula: `IF($${symCol}${r}="","",IFERROR(VLOOKUP($${symCol}${r},'종목목록'!$A:$E,${AUTO_COLS[h]},FALSE),"(목록에 없음)"))`, result: v ?? '' };
          c.fill = autoFill;
        } else if (v !== undefined && v !== '') c.value = v;
      });
      row.getCell(col('심볼')).numFmt = '@'; // 005930 같은 코드가 숫자로 바뀌지 않게
      // 수량·평균매입가: 숫자 서식 + 천 단위 콤마. 소수 수량은 소수점까지, USD 평균매입가는 소수 둘째 자리
      const q = data[col('수량') - 1], cur = data[col('통화') - 1];
      row.getCell(col('수량')).numFmt = q % 1 ? NUM_FRAC : '#,##0';
      row.getCell(col('평균매입가')).numFmt = cur === 'USD' ? '#,##0.00' : '#,##0';
      // 입력 제한: 잡주는 수량 1, 현금(자산유형 CASH)은 평균매입가 1
      const cell = h => colLetter(col(h)) + r;
      row.getCell(col('수량')).dataValidation = { type: 'custom', allowBlank: true, formulae: [`OR(AND($${cell('종목명')}<>"잡주",$${cell('심볼')}<>"${JUNK_SYMBOL}"),${cell('수량')}=1)`], showErrorMessage: true, errorTitle: '수량', error: '잡주(999999)의 수량은 1만 입력할 수 있습니다.' };
      row.getCell(col('평균매입가')).dataValidation = { type: 'custom', allowBlank: true, formulae: [`OR($${cell('자산유형')}<>"CASH",${cell('평균매입가')}=1)`], showErrorMessage: true, errorTitle: '평균매입가', error: '현금의 평균매입가는 1만 입력할 수 있습니다.' };
      row.getCell(col('증권사')).dataValidation = { type: 'list', allowBlank: true, formulae: [`'선택목록'!$A$2:$A$${brokers.length + 1}`], showErrorMessage: true, errorTitle: '증권사', error: '목록에서 선택해 주세요 (선택목록 시트 = 증권 마스터)' };
      row.getCell(col('계좌종류')).dataValidation = { type: 'list', allowBlank: true, formulae: [`'선택목록'!$B$2:$B$${types.length + 1}`], showErrorMessage: true, errorTitle: '계좌종류', error: '목록에서 선택해 주세요 (선택목록 시트 = 증권 마스터)' };
    }
    // 엑셀에서 통화·수량을 고쳐 써도 서식이 따라가도록 조건부 서식도 함께
    const qL = colLetter(col('수량')), pL = colLetter(col('평균매입가')), cL = colLetter(col('통화')), last = total + 1;
    ws.addConditionalFormatting({ ref: `${pL}2:${pL}${last}`, rules: [
      { type: 'expression', priority: 1, formulae: [`$${cL}2="USD"`], style: { numFmt: '#,##0.00' } },
      { type: 'expression', priority: 2, formulae: [`$${cL}2<>"USD"`], style: { numFmt: '#,##0' } }] });
    ws.addConditionalFormatting({ ref: `${qL}2:${qL}${last}`, rules: [
      { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER($${qL}2),MOD($${qL}2,1)<>0)`], style: { numFmt: NUM_FRAC } }] });

    // 최신 계좌현황 (참고용 값만 — 업로드는 '보유' 시트만 읽음. 이 행들을 '보유' 시트에 붙여 넣으면 지금 현황 그대로 올릴 수 있음)
    if (latest) {
      const ls = wb.addWorksheet('최신 계좌현황', { views: [{ state: 'frozen', ySplit: 2 }] });
      ls.getCell('A1').value = `지금 보유 현황 · 현황 기준일 ${state.meta.baseDate} (${state.meta.baseSource}) · 내려받은 시각 ${Fmt.mdhm(nowISO())} · 업로드는 '보유' 시트만 읽습니다 (이 행들을 '보유' 시트에 붙여 넣어 쓸 수 있습니다)`;
      ls.getCell('A1').font = { italic: true, color: { argb: 'FF666666' } };
      ls.getRow(2).values = HEADERS;
      ls.getRow(2).eachCell(c => { c.font = bold; c.fill = headFill; });
      latest.forEach((d, i) => {
        const row = ls.getRow(i + 3);
        row.values = d.map(v => (v === undefined ? null : v));
        row.getCell(col('심볼')).numFmt = '@';
        row.getCell(col('심볼')).value = String(d[col('심볼') - 1] ?? '');
        const q = d[col('수량') - 1], cur = d[col('통화') - 1];
        row.getCell(col('수량')).numFmt = q % 1 ? NUM_FRAC : '#,##0';
        row.getCell(col('평균매입가')).numFmt = cur === 'USD' ? '#,##0.00' : '#,##0';
      });
      [14, 13, 12, 12, 30, 9, 9, 7, 14, 14, 13, 34].forEach((w, j) => { ls.getColumn(j + 1).width = w; });
    }

    // 종목목록: 심볼 → 종목명·거래소·자산유형·통화 (DB = 종목 마스터 + 외부 종목 목록)
    const list = wb.addWorksheet('종목목록', { views: [{ state: 'frozen', ySplit: 1 }] });
    list.addRow(['심볼', '종목명', '거래소', '자산유형', '통화']).eachCell(c => { c.font = bold; c.fill = headFill; });
    list.getColumn(1).numFmt = '@';
    (await symbolRefs()).forEach(x => list.addRow([x.symbol, x.name, x.exchange, x.asset_type, x.currency]));
    [12, 34, 10, 10, 7].forEach((w, j) => { list.getColumn(j + 1).width = w; });

    // 선택목록: 증권 마스터 (드롭다운 원본)
    const sel = wb.addWorksheet('선택목록');
    sel.addRow(['증권사', '계좌종류']).eachCell(c => { c.font = bold; c.fill = headFill; });
    for (let i = 0; i < Math.max(brokers.length, types.length); i++) sel.addRow([brokers[i] ? brokers[i].name : null, types[i] ? types[i].name : null]);
    sel.getColumn(1).width = 16; sel.getColumn(2).width = 16;

    // 작성안내
    const guide = wb.addWorksheet('작성안내');
    MOCK.xlsxSamples.guide.forEach(r => guide.addRow(r));
    guide.getRow(1).font = bold;
    guide.getColumn(1).width = 18; guide.getColumn(2).width = 12; guide.getColumn(3).width = 96;

    wb.views = [{ activeTab: 1 }];
    return wb.xlsx.writeBuffer();
  }
  function saveBlob(buf, fileName) {
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function exportHoldingsXlsx() {
    saveBlob(await buildExcelBuffer(state.meta.baseDate, currentRows()), `myAsset_현재보유_${state.meta.baseDate}.xlsx`);
  }
  async function downloadSampleXlsx(baseDate) {
    const d = baseDate || Fmt.todayKST();
    saveBlob(await buildExcelBuffer(d, MOCK.xlsxSamples.sample, { latest: currentRows() }), `myAsset_샘플데이터_${d}.xlsx`);
  }
  async function downloadTemplateXlsx(baseDate) {
    const d = baseDate || Fmt.todayKST();
    saveBlob(await buildExcelBuffer(d, MOCK.xlsxSamples.template), `myAsset_업로드양식_${d}.xlsx`);
  }
  async function downloadIssuesXlsx(errors, warnings) {
    const aoa = [['구분', '행 번호', '컬럼', '입력값', 'DB 값', '사유']];
    errors.forEach(e => aoa.push(['오류', e.row, e.col, e.value, e.expected || '', e.reason]));
    warnings.forEach(e => aoa.push(['경고', e.row, e.col, e.value, e.expected || '', e.reason]));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 8, 12, 20, 24, 60].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, '점검결과');
    XLSX.writeFile(wb, `myAsset_업로드점검결과_${Fmt.todayKST()}.xlsx`);
  }

  load();

  return {
    onChange, resetMock, getStatus, syncFromCloud, pushNow, flushAndClearLocal, onCloudStatus, getCloudStatus,
    getAccounts, addAccount, updateAccount, deleteAccount,
    getTargetPlans, saveTargetPlan, setGroupTargets, deleteTargetPlan, resetTargetPlans,
    getBrokers, getAccountTypes, addMaster, updateMaster, deleteMaster,
    getGroups, addGroup, updateGroup, moveGroup, deleteGroup,
    getInstruments, searchInstruments, addInstrument, updateInstrumentGroup,
    getCatalogInfo, syncCatalog, autoSyncCatalogIfDue, searchCatalog, ensureInstrument, trackInstruments, trackDaily,
    updateInstrumentAttrs,
    getHoldings, addHolding, updateHolding, deleteHolding,
    getPrices, getFxRate, getFxHistory, getPriceMeta, getPriceStatus, refreshPrices, getQqqSignal, setManualPrice, getManualPrice,
    getSnapshots, getSnapshotItems, createDailySnapshot, startRealHistory, autoDailySnapshot, ensureHistory,
    parseHoldingsXlsx, validateImport, previewImport, replaceCurrentHoldings, undoLastImport,
    exportHoldingsXlsx, downloadSampleXlsx, downloadTemplateXlsx, downloadIssuesXlsx,
    // 자체 점검(tools/selftest.html) 전용
    _test: { buildWorkbook, buildExcelBuffer, currentRows, getBaseDate: () => state.meta.baseDate }
  };
})();
