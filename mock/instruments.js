// Mock 종목 마스터 (종목코드·가격은 예시입니다)
// asset_group: CASH / LEVERAGE / NASDAQ100 / SP500 / OTHER_STOCK / GOLD / BLOCKCHAIN / null(미지정)
window.MOCK = window.MOCK || {};
(function () {
  const t = '2025-08-01T09:00:00+09:00';
  const I = (id, name, eng_name, symbol, exchange, asset_type, currency, asset_group) =>
    ({ id, user_id: 'mock-user', name, eng_name, symbol, exchange, asset_type, currency, asset_group, created_at: t, updated_at: t });
  window.MOCK.instruments = [
    I('ins-cash-krw', '현금', 'Cash KRW', 'CASH-KRW', 'CASH', 'CASH', 'KRW', 'CASH'),
    I('ins-cash-usd', '달러 현금', 'Cash USD', 'CASH-USD', 'CASH', 'CASH', 'USD', 'CASH'),
    I('ins-kodex-cd', 'KODEX CD금리액티브(합성)', 'KODEX CD Rate Active', '459580', 'KRX', 'ETF', 'KRW', 'CASH'),
    I('ins-tiger-tbill', 'TIGER 미국초단기국채', 'TIGER US Ultra Short Treasury', '0046A0', 'KRX', 'ETF', 'KRW', 'CASH'),
    I('ins-qld', 'QLD', 'ProShares Ultra QQQ', 'QLD', 'NYSE', 'ETF', 'USD', 'LEVERAGE'),
    I('ins-tiger-ndx-lev', 'TIGER 미국나스닥100레버리지(합성)', 'TIGER Nasdaq100 Leverage', '418660', 'KRX', 'ETF', 'KRW', 'LEVERAGE'),
    I('ins-qqq', 'QQQ', 'Invesco QQQ Trust', 'QQQ', 'NASDAQ', 'ETF', 'USD', 'NASDAQ100'),
    I('ins-kodex-ndx', 'KODEX 미국나스닥100', 'KODEX US Nasdaq100', '379810', 'KRX', 'ETF', 'KRW', 'NASDAQ100'),
    I('ins-qqqm', 'QQQM', 'Invesco Nasdaq 100 ETF', 'QQQM', 'NASDAQ', 'ETF', 'USD', 'NASDAQ100'),
    I('ins-voo', 'VOO', 'Vanguard S&P 500 ETF', 'VOO', 'NYSE', 'ETF', 'USD', 'SP500'),
    I('ins-kodex-sp500', 'KODEX 미국S&P500', 'KODEX US S&P500', '379800', 'KRX', 'ETF', 'KRW', 'SP500'),
    I('ins-schd', 'SCHD', 'Schwab US Dividend Equity ETF', 'SCHD', 'NYSE', 'ETF', 'USD', 'SP500'),
    I('ins-samsung', '삼성전자', 'Samsung Electronics', '005930', 'KRX', 'STOCK', 'KRW', 'OTHER_STOCK'),
    I('ins-hynix', 'SK하이닉스', 'SK hynix', '000660', 'KRX', 'STOCK', 'KRW', 'OTHER_STOCK'),
    I('ins-krx-gold', 'KRX 금현물', 'KRX Gold Spot', 'M04020000', 'KRX', 'GOLD', 'KRW', 'GOLD'),
    I('ins-btc', '비트코인', 'Bitcoin', 'BTC', 'UPBIT', 'CRYPTO', 'KRW', 'BLOCKCHAIN'),
    I('ins-pltr', '팔란티어', 'Palantir Technologies', 'PLTR', 'NASDAQ', 'STOCK', 'USD', null),
    // 보유하지 않은 종목 (검색·추가 테스트용)
    I('ins-nvda', '엔비디아', 'NVIDIA', 'NVDA', 'NASDAQ', 'STOCK', 'USD', 'OTHER_STOCK'),
    I('ins-eth', '이더리움', 'Ethereum', 'ETH', 'UPBIT', 'CRYPTO', 'KRW', 'BLOCKCHAIN'),
    I('ins-tiger-sp500', 'TIGER 미국S&P500', 'TIGER US S&P500', '360750', 'KRX', 'ETF', 'KRW', 'SP500'),
    I('ins-spy', 'SPY', 'SPDR S&P 500 ETF Trust', 'SPY', 'NYSE', 'ETF', 'USD', 'SP500')
  ];
})();
