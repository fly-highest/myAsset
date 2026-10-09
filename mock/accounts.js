// Mock 계좌 (가상 데이터 — 실제 계좌가 아닙니다)
// broker_id / account_type_id 는 mock/securityMaster.js 의 증권 마스터 id, memo = 비고
window.MOCK = window.MOCK || {};
(function () {
  const t = '2025-08-01T09:00:00+09:00';
  const A = (id, name, broker_id, account_type_id, memo) => ({ id, user_id: 'mock-user', name, broker_id, account_type_id, memo, created_at: t, updated_at: t });
  window.MOCK.accounts = [
    A('acc-kiwoom', '키움 일반', 'brk-kiwoom', 'atp-general', ''),
    A('acc-isa', '키움 ISA', 'brk-kiwoom', 'atp-isa', '2025년 개설 · 의무가입 3년 (2028-08 만기)'),
    A('acc-mirae', '미래 해외', 'brk-mirae', 'atp-overseas', '미국 ETF 적립용'),
    A('acc-gold', 'KRX 금현물', 'brk-kiwoom', 'atp-gold', ''),
    A('acc-upbit', '업비트', 'brk-upbit', 'atp-crypto', ''),
    A('acc-cash', '현금', 'brk-etc', 'atp-cash', '비상금 (계좌와 무관한 현금)')
  ];
})();
