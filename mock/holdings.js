// Mock 보유 (계좌 × 종목, 가상 수량·금액)
// avg_fx_rate: 매입 평균환율(USD/KRW). KRW 종목은 1. 현금은 avg_price = 1.
window.MOCK = window.MOCK || {};
(function () {
  const t = '2026-10-01T09:00:00+09:00';
  const H = (id, account_id, instrument_id, quantity, avg_price, avg_fx_rate) =>
    ({ id, user_id: 'mock-user', account_id, instrument_id, quantity, avg_price, avg_fx_rate, created_at: t, updated_at: t });
  window.MOCK.holdings = [
    H('h01', 'acc-kiwoom', 'ins-cash-krw', 3250000, 1, 1),
    H('h02', 'acc-kiwoom', 'ins-cash-usd', 1200.5, 1, 1352.40),
    H('h03', 'acc-kiwoom', 'ins-qqq', 12, 480.25, 1342.10),
    H('h04', 'acc-kiwoom', 'ins-voo', 8, 545.10, 1421.30),
    H('h05', 'acc-kiwoom', 'ins-qld', 20, 98.40, 1398.70),
    H('h06', 'acc-kiwoom', 'ins-samsung', 150, 68400, 1),
    H('h07', 'acc-kiwoom', 'ins-pltr', 30, 142.80, 1365.00),
    H('h08', 'acc-kiwoom', 'ins-schd', 60, 27.15, 1410.20),
    H('h09', 'acc-isa', 'ins-cash-krw', 820000, 1, 1),
    H('h10', 'acc-isa', 'ins-kodex-cd', 12, 1046500, 1),
    H('h11', 'acc-isa', 'ins-tiger-tbill', 300, 10080, 1),
    H('h12', 'acc-isa', 'ins-tiger-ndx-lev', 300, 13250, 1),
    H('h13', 'acc-isa', 'ins-kodex-ndx', 450, 19820, 1),
    H('h14', 'acc-isa', 'ins-kodex-sp500', 520, 17940, 1),
    H('h15', 'acc-isa', 'ins-hynix', 25, 198500, 1),
    H('h16', 'acc-mirae', 'ins-cash-usd', 850, 1, 1401.10),
    H('h17', 'acc-mirae', 'ins-qqq', 5, 512.60, 1412.40),
    H('h18', 'acc-mirae', 'ins-qqqm', 15, 205.30, 1371.80),
    H('h19', 'acc-gold', 'ins-krx-gold', 120, 128500, 1),
    H('h20', 'acc-upbit', 'ins-cash-krw', 450000, 1, 1),
    H('h21', 'acc-upbit', 'ins-btc', 0.03857214, 128450000, 1),
    H('h22', 'acc-cash', 'ins-cash-krw', 5000000, 1, 1)
  ];
})();
