// Mock '외부 종목 목록' (상장 종목 리스트)
// 실제 연동 시: 한 달에 한 번 외부(KRX 상장 목록, 미국 거래소 목록, 업비트 마켓 목록 등)에서 받아와 DB 에 저장하고,
// 화면의 종목 검색은 이 저장된 목록을 조회합니다. (매번 외부를 부르지 않아 빠르고 DB 용량도 아낌)
// 여기 있는 종목코드는 예시이며 가격 정보는 없습니다.
window.MOCK = window.MOCK || {};
(function () {
  const C = (name, eng_name, symbol, exchange, asset_type, currency) => ({ name, eng_name, symbol, exchange, asset_type, currency });
  window.MOCK.catalog = {
    synced_at: '2026-10-01T03:00:00+09:00',
    items: [
      // 현금성
      C('현금', 'Cash KRW', 'CASH-KRW', 'CASH', 'CASH', 'KRW'),
      C('달러 현금', 'Cash USD', 'CASH-USD', 'CASH', 'CASH', 'USD'),
      C('달러 RP', 'USD RP', 'RP-USD', 'CASH', 'CASH', 'USD'),
      C('원화 RP', 'KRW RP', 'RP-KRW', 'CASH', 'CASH', 'KRW'),
      // 국내 ETF
      C('KODEX 200', 'KODEX 200', '069500', 'KRX', 'ETF', 'KRW'),
      C('TIGER 200', 'TIGER 200', '102110', 'KRX', 'ETF', 'KRW'),
      C('KODEX 레버리지', 'KODEX Leverage', '122630', 'KRX', 'ETF', 'KRW'),
      C('KODEX 인버스', 'KODEX Inverse', '114800', 'KRX', 'ETF', 'KRW'),
      C('KODEX CD금리액티브(합성)', 'KODEX CD Rate Active', '459580', 'KRX', 'ETF', 'KRW'),
      C('TIGER CD금리투자KIS(합성)', 'TIGER CD Rate', '357870', 'KRX', 'ETF', 'KRW'),
      C('KODEX 머니마켓액티브', 'KODEX Money Market Active', '488770', 'KRX', 'ETF', 'KRW'),
      C('TIGER 미국초단기국채', 'TIGER US Ultra Short Treasury', '0046A0', 'KRX', 'ETF', 'KRW'),
      C('TIGER 미국S&P500', 'TIGER US S&P500', '360750', 'KRX', 'ETF', 'KRW'),
      C('KODEX 미국S&P500', 'KODEX US S&P500', '379800', 'KRX', 'ETF', 'KRW'),
      C('ACE 미국S&P500', 'ACE US S&P500', '360200', 'KRX', 'ETF', 'KRW'),
      C('TIGER 미국나스닥100', 'TIGER US Nasdaq100', '133690', 'KRX', 'ETF', 'KRW'),
      C('KODEX 미국나스닥100', 'KODEX US Nasdaq100', '379810', 'KRX', 'ETF', 'KRW'),
      C('TIGER 미국나스닥100레버리지(합성)', 'TIGER Nasdaq100 Leverage', '418660', 'KRX', 'ETF', 'KRW'),
      C('TIGER 미국테크TOP10 INDXX', 'TIGER US Tech TOP10', '381170', 'KRX', 'ETF', 'KRW'),
      C('TIGER 미국배당다우존스', 'TIGER US Dividend Dow Jones', '458730', 'KRX', 'ETF', 'KRW'),
      C('ACE KRX금현물', 'ACE KRX Gold Spot', '411060', 'KRX', 'ETF', 'KRW'),
      C('KODEX 골드선물(H)', 'KODEX Gold Futures', '132030', 'KRX', 'ETF', 'KRW'),
      C('KRX 금현물', 'KRX Gold Spot', 'M04020000', 'KRX', 'GOLD', 'KRW'),
      // 국내 주식
      C('삼성전자', 'Samsung Electronics', '005930', 'KRX', 'STOCK', 'KRW'),
      C('삼성전자우', 'Samsung Electronics Pref', '005935', 'KRX', 'STOCK', 'KRW'),
      C('SK하이닉스', 'SK hynix', '000660', 'KRX', 'STOCK', 'KRW'),
      C('LG에너지솔루션', 'LG Energy Solution', '373220', 'KRX', 'STOCK', 'KRW'),
      C('삼성바이오로직스', 'Samsung Biologics', '207940', 'KRX', 'STOCK', 'KRW'),
      C('현대차', 'Hyundai Motor', '005380', 'KRX', 'STOCK', 'KRW'),
      C('기아', 'Kia', '000270', 'KRX', 'STOCK', 'KRW'),
      C('셀트리온', 'Celltrion', '068270', 'KRX', 'STOCK', 'KRW'),
      C('NAVER', 'NAVER', '035420', 'KRX', 'STOCK', 'KRW'),
      C('카카오', 'Kakao', '035720', 'KRX', 'STOCK', 'KRW'),
      C('KB금융', 'KB Financial', '105560', 'KRX', 'STOCK', 'KRW'),
      C('POSCO홀딩스', 'POSCO Holdings', '005490', 'KRX', 'STOCK', 'KRW'),
      // 미국 ETF
      C('SPY', 'SPDR S&P 500 ETF Trust', 'SPY', 'NYSE', 'ETF', 'USD'),
      C('VOO', 'Vanguard S&P 500 ETF', 'VOO', 'NYSE', 'ETF', 'USD'),
      C('IVV', 'iShares Core S&P 500 ETF', 'IVV', 'NYSE', 'ETF', 'USD'),
      C('SPLG', 'SPDR Portfolio S&P 500 ETF', 'SPLG', 'NYSE', 'ETF', 'USD'),
      C('VTI', 'Vanguard Total Stock Market ETF', 'VTI', 'NYSE', 'ETF', 'USD'),
      C('SCHD', 'Schwab US Dividend Equity ETF', 'SCHD', 'NYSE', 'ETF', 'USD'),
      C('JEPI', 'JPMorgan Equity Premium Income ETF', 'JEPI', 'NYSE', 'ETF', 'USD'),
      C('QQQ', 'Invesco QQQ Trust', 'QQQ', 'NASDAQ', 'ETF', 'USD'),
      C('QQQM', 'Invesco Nasdaq 100 ETF', 'QQQM', 'NASDAQ', 'ETF', 'USD'),
      C('QLD', 'ProShares Ultra QQQ', 'QLD', 'NYSE', 'ETF', 'USD'),
      C('TQQQ', 'ProShares UltraPro QQQ', 'TQQQ', 'NASDAQ', 'ETF', 'USD'),
      C('SSO', 'ProShares Ultra S&P500', 'SSO', 'NYSE', 'ETF', 'USD'),
      C('UPRO', 'ProShares UltraPro S&P500', 'UPRO', 'NYSE', 'ETF', 'USD'),
      C('SOXX', 'iShares Semiconductor ETF', 'SOXX', 'NASDAQ', 'ETF', 'USD'),
      C('SMH', 'VanEck Semiconductor ETF', 'SMH', 'NASDAQ', 'ETF', 'USD'),
      C('TLT', 'iShares 20+ Year Treasury Bond ETF', 'TLT', 'NASDAQ', 'ETF', 'USD'),
      C('SGOV', 'iShares 0-3 Month Treasury Bond ETF', 'SGOV', 'NYSE', 'ETF', 'USD'),
      C('BIL', 'SPDR Bloomberg 1-3 Month T-Bill ETF', 'BIL', 'NYSE', 'ETF', 'USD'),
      C('GLD', 'SPDR Gold Shares', 'GLD', 'NYSE', 'ETF', 'USD'),
      C('IAU', 'iShares Gold Trust', 'IAU', 'NYSE', 'ETF', 'USD'),
      // 미국 주식
      C('애플', 'Apple', 'AAPL', 'NASDAQ', 'STOCK', 'USD'),
      C('마이크로소프트', 'Microsoft', 'MSFT', 'NASDAQ', 'STOCK', 'USD'),
      C('엔비디아', 'NVIDIA', 'NVDA', 'NASDAQ', 'STOCK', 'USD'),
      C('알파벳 A', 'Alphabet Class A', 'GOOGL', 'NASDAQ', 'STOCK', 'USD'),
      C('아마존', 'Amazon', 'AMZN', 'NASDAQ', 'STOCK', 'USD'),
      C('메타', 'Meta Platforms', 'META', 'NASDAQ', 'STOCK', 'USD'),
      C('테슬라', 'Tesla', 'TSLA', 'NASDAQ', 'STOCK', 'USD'),
      C('브로드컴', 'Broadcom', 'AVGO', 'NASDAQ', 'STOCK', 'USD'),
      C('팔란티어', 'Palantir Technologies', 'PLTR', 'NASDAQ', 'STOCK', 'USD'),
      C('버크셔 해서웨이 B', 'Berkshire Hathaway B', 'BRK.B', 'NYSE', 'STOCK', 'USD'),
      C('JP모건', 'JPMorgan Chase', 'JPM', 'NYSE', 'STOCK', 'USD'),
      C('코카콜라', 'Coca-Cola', 'KO', 'NYSE', 'STOCK', 'USD'),
      // 가상자산 (업비트 원화마켓)
      C('비트코인', 'Bitcoin', 'BTC', 'UPBIT', 'CRYPTO', 'KRW'),
      C('이더리움', 'Ethereum', 'ETH', 'UPBIT', 'CRYPTO', 'KRW'),
      C('리플', 'XRP', 'XRP', 'UPBIT', 'CRYPTO', 'KRW'),
      C('솔라나', 'Solana', 'SOL', 'UPBIT', 'CRYPTO', 'KRW')
    ]
  };
})();
