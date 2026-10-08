// Mock 현재가 (원본통화 기준). 향후 Kiwoom/Upbit 가격 API로 교체되는 지점입니다.
// 현금(asset_type=CASH)은 항상 1이므로 여기에 두지 않습니다.
window.MOCK = window.MOCK || {};
window.MOCK.prices = {
  as_of: '2026-10-08T08:00:00+09:00',
  values: {
    'ins-kodex-cd': 1058200,
    'ins-tiger-tbill': 10215,
    'ins-qld': 112.60,
    'ins-tiger-ndx-lev': 14870,
    'ins-qqq': 552.30,
    'ins-kodex-ndx': 21340,
    'ins-qqqm': 227.40,
    'ins-voo': 571.80,
    'ins-kodex-sp500': 18760,
    'ins-schd': 27.92,
    'ins-samsung': 74200,
    'ins-hynix': 231000,
    'ins-krx-gold': 141200,
    'ins-btc': 142350000,
    'ins-pltr': 158.40,
    'ins-nvda': 182.50,
    'ins-eth': 5120000,
    'ins-tiger-sp500': 22150,
    'ins-spy': 621.30
  }
};
