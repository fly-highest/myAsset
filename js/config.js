// 앱 공통 설정 — 자산군 7개(고정 순서), 허용값 등
window.APP_CONFIG = {
  GROUPS: [
    { code: 'CASH', name: '현금성', color: '#7f97a8' },
    { code: 'LEVERAGE', name: '레버리지', color: '#d9434f' },
    { code: 'NASDAQ100', name: '나스닥1배', color: '#2f6fdf' },
    { code: 'SP500', name: 'S&P500', color: '#17a589' },
    { code: 'OTHER_STOCK', name: '기타종목', color: '#8e5cc4' },
    { code: 'GOLD', name: '금', color: '#c9a227' },
    { code: 'BLOCKCHAIN', name: 'Crypto', color: '#ef7d22' }
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

// 추종 통화 · 자산 성향 (종목 속성) — 자산 현황 화면의 '추종 통화별' · '자산 성향별' 통계에 사용
// 거래 통화(currency) = 사고파는 통화, 추종 통화(track_currency) = 가격이 따라가는 통화 (비우면 거래 통화와 같음)
window.TrackCur = {
  list: [
    { code: 'KRW', name: '원화 (KRW)', color: '#2f6fdf' },
    { code: 'USD', name: '달러 (USD)', color: '#17a589' }
  ],
  of(inst) { const c = (inst && (inst.track_currency || inst.currency)) || 'KRW'; return this.list.some(x => x.code === c) ? c : 'KRW'; },
  name(code) { const t = this.list.find(x => x.code === code); return t ? t.name : code; }
};
// 자산 성향: 성장 · 현금 · 배당 · 원자재 · Crypto, 그리고 성장/배당 혼합 'MIX_55' (= 성55배45 = 성장 55% + 배당 45%)
// 비어 있으면 자산유형으로 기본값 (현금 → 현금, 가상자산 → Crypto, 금 → 원자재), 그 밖은 미지정
window.Styles = {
  list: [
    { code: 'GROWTH', name: '성장', color: '#2f6fdf' },
    { code: 'CASH', name: '현금', color: '#7f97a8' },
    { code: 'DIVIDEND', name: '배당', color: '#17a589' },
    { code: 'COMMODITY', name: '원자재', color: '#c9a227' },
    { code: 'CRYPTO', name: 'Crypto', color: '#ef7d22' }
  ],
  UNSET: { code: 'UNSET', name: '미지정', color: '#b8bec8' },
  PRESET_MIX: [50, 55], // 성50배50, 성55배45
  // 저장값 정리: 'MIX_55' / '성55배45' / '성장' 등 → 코드 (알 수 없으면 null)
  normalize(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    let m = s.match(/^MIX_(\d{1,3})$/i) || s.match(/^성\s*(\d{1,3})\s*배\s*(\d{1,3})$/);
    if (m) { const g = +m[1]; if (m[2] !== undefined && g + +m[2] !== 100) return null; return g === 100 ? 'GROWTH' : g === 0 ? 'DIVIDEND' : g > 0 && g < 100 ? 'MIX_' + g : null; }
    const hit = this.list.find(x => x.code === s.toUpperCase() || x.name === s);
    return hit ? hit.code : null;
  },
  effective(inst) {
    const c = this.normalize(inst && inst.style);
    if (c) return c;
    const t = inst && inst.asset_type;
    return t === 'CASH' ? 'CASH' : t === 'CRYPTO' ? 'CRYPTO' : t === 'GOLD' ? 'COMMODITY' : 'UNSET';
  },
  isDefault(inst) { return !this.normalize(inst && inst.style); },
  name(code) {
    const m = String(code || '').match(/^MIX_(\d+)$/);
    if (m) return `성${m[1]}배${100 - m[1]}`;
    const s = this.list.find(x => x.code === code);
    return s ? s.name : code === 'UNSET' ? '미지정' : code;
  },
  // 통계용 나눔: 혼합은 성장·배당에 비율대로 → [[코드, 비율], ...]
  split(inst) {
    const c = this.effective(inst), m = c.match(/^MIX_(\d+)$/);
    return m ? [['GROWTH', m[1] / 100], ['DIVIDEND', (100 - m[1]) / 100]] : [[c, 1]];
  }
};
