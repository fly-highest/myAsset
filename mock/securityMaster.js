// Mock 증권 마스터 — 증권사(brokers)·계좌종류(account_types) 표준 목록
// 계좌는 이름 대신 이 목록의 id(broker_id, account_type_id)를 저장해 표기를 통일합니다.
// 화면: 계좌/자산관리 › 계좌 관리 › 계좌 추가/수정 › [증권 마스터 수정]
window.MOCK = window.MOCK || {};
window.MOCK.brokers = [
  { id: 'brk-kiwoom', name: '키움증권', sort: 1 },
  { id: 'brk-mirae', name: '미래에셋증권', sort: 2 },
  { id: 'brk-kis', name: '한국투자증권', sort: 3 },
  { id: 'brk-samsung', name: '삼성증권', sort: 4 },
  { id: 'brk-nh', name: 'NH투자증권', sort: 5 },
  { id: 'brk-kb', name: 'KB증권', sort: 6 },
  { id: 'brk-shinhan', name: '신한투자증권', sort: 7 },
  { id: 'brk-toss', name: '토스증권', sort: 8 },
  { id: 'brk-meritz', name: '메리츠증권', sort: 8.5 },
  { id: 'brk-upbit', name: '업비트', sort: 9 },
  { id: 'brk-bithumb', name: '빗썸', sort: 10 },
  { id: 'brk-bank', name: '은행', sort: 11 },
  { id: 'brk-etc', name: '기타', sort: 99 }
];
window.MOCK.accountTypes = [
  { id: 'atp-general', name: '일반(위탁)', sort: 1 },
  { id: 'atp-isa', name: 'ISA', sort: 2 },
  { id: 'atp-pension', name: '연금저축', sort: 3 },
  { id: 'atp-irp', name: 'IRP', sort: 4 },
  { id: 'atp-dc', name: 'DC', sort: 4.5 },
  { id: 'atp-overseas', name: '해외주식', sort: 5 },
  { id: 'atp-cma', name: 'CMA', sort: 6 },
  { id: 'atp-gold', name: '금현물', sort: 7 },
  { id: 'atp-crypto', name: '가상자산', sort: 8 },
  { id: 'atp-cash', name: '예금·현금', sort: 9 }
];
