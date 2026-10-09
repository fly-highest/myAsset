// 앱 공통 설정 — 자산군 7개(고정 순서), 허용값 등
window.APP_CONFIG = {
  GROUPS: [
    { code: 'CASH', name: '현금성', color: '#7f97a8' },
    { code: 'LEVERAGE', name: '레버리지', color: '#d9434f' },
    { code: 'NASDAQ100', name: '나스닥1배', color: '#2f6fdf' },
    { code: 'SP500', name: 'S&P500', color: '#17a589' },
    { code: 'OTHER_STOCK', name: '기타종목', color: '#8e5cc4' },
    { code: 'GOLD', name: '금', color: '#c9a227' },
    { code: 'BLOCKCHAIN', name: '블록체인', color: '#ef7d22' }
  ],
  ASSET_TYPES: ['ETF', 'STOCK', 'CRYPTO', 'GOLD', 'CASH'],
  CURRENCIES: ['KRW', 'USD'],
  EXCHANGES: ['KRX', 'NASDAQ', 'NYSE', 'UPBIT', 'CASH'],
  STORAGE_KEY: 'myAsset.mock.v1',
  USER_ID: 'mock-user',
  // Supabase (현재가·환율 읽기 전용). publishable 키는 브라우저 공개용 키라 코드에 있어도 됩니다.
  // 쓰기는 서버 함수(update-prices)만 할 수 있도록 DB 보안 규칙(RLS)으로 막혀 있습니다.
  SUPABASE: {
    url: 'https://sertbrnhwpmuyfyryaov.supabase.co',
    key: 'sb_publishable_oULEo71clmkuEqyTDIDtxQ_gmrcKIJo'
  }
};

// 자산군 목록 — 기본 7개로 시작, 계좌/자산관리 › [자산군 편집]에서 추가·삭제·이름/색/순서 변경 (dataService 가 Groups.set 으로 채움)
window.Groups = {
  FALLBACK: 'OTHER_STOCK', // 미지정 종목이 모이는 자산군 (삭제 불가)
  list: window.APP_CONFIG.GROUPS.slice(),
  get codes() { return this.list.map(g => g.code); },
  set(list) { this.list = list; },
  has(code) { return this.list.some(g => g.code === code); },
  name(code) { const g = this.list.find(x => x.code === code); return g ? g.name : code; },
  color(code) { const g = this.list.find(x => x.code === code); return g ? g.color : '#999'; },
  // NULL(미지정)이나 삭제된 자산군은 기타종목으로 집계
  of(inst) { const c = inst && inst.asset_group; return c && this.has(c) ? c : this.FALLBACK; },
  // 코드 또는 한글명 → 코드 (없으면 undefined)
  parse(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const g = this.list.find(x => x.code === s.toUpperCase() || x.name.toUpperCase() === s.toUpperCase());
    return g ? g.code : undefined;
  }
};
