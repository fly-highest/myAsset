// update-markets — 시장 지표 일별 종가를 DB(fx_daily)에 이어 붙입니다. (매시 15분 자동)
//   Yahoo(+Google): DXY · WTI · BRENT · QQQ · SPY · GLD · VIX · COPPER · XAU(국제 금시세) · BTC(매일)
//   그 밖: 미 재무부(국채 10년·2년·금리차) · 업비트(비트코인 원화) · 네이버(한국 국채 3년) · KB(선도아파트 50) · FRED(하이일드 스프레드·M2) · CNN(공포·탐욕)
//   1순위: Google Finance (Google 시트의 GOOGLEFINANCE, 매시 정각 update-prices 와 같은 시트) → 오늘(거래일) 값
//   2순위: Yahoo Finance 일봉 (Google 에 값이 없을 때, 그리고 빠진 지난 날짜 채우기)
//   과거 자료는 업로드한 CSV(Investing.com, source = 'CSV') — 그 날짜는 덮어쓰지 않습니다. 평일만, 날짜는 거래소 현지 날짜
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const UA = { 'User-Agent': 'Mozilla/5.0' };
const SERIES: { pair: string; google: string | null; yahoo: string; everyDay?: boolean }[] = [
  // 달러 인덱스 · WTI · 브렌트유: GOOGLEFINANCE 가 값을 주지 않음 (2026-10-10, 시트로 20회 확인) → Yahoo 만 사용
  { pair: 'DXY', google: null, yahoo: 'DX-Y.NYB' },
  { pair: 'WTI', google: null, yahoo: 'CL=F' },
  { pair: 'BRENT', google: null, yahoo: 'BZ=F' },
  { pair: 'QQQ', google: 'NASDAQ:QQQ', yahoo: 'QQQ' },
  { pair: 'SPY', google: 'NYSEARCA:SPY', yahoo: 'SPY' },
  { pair: 'GLD', google: 'NYSEARCA:GLD', yahoo: 'GLD' },
  { pair: 'VIX', google: 'INDEXCBOE:VIX', yahoo: '^VIX' }, // CBOE 변동성 지수
  { pair: 'COPPER', google: null, yahoo: 'HG=F' }, // 구리 선물 (달러/파운드) — 구리/금 비율용
  // 국제 금시세(달러/온스, 금환산 이력용): GOOGLEFINANCE 의 CURRENCY:XAUUSD 는 값을 주지 않음 → Yahoo 금 선물
  { pair: 'XAU', google: null, yahoo: 'GC=F' },
  // 비트코인: 주말에도 거래 → 매일 저장, 날짜는 UTC 기준 (Investing.com 비트파이넥스와 같음)
  { pair: 'BTC', google: 'CURRENCY:BTCUSD', yahoo: 'BTC-USD', everyDay: true }
];

type Bar = { date: string; close: number; open: number | null; high: number | null; low: number | null; source: string };
const weekday = (d: string) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w >= 1 && w <= 5; };
const num = (v: unknown) => (v == null || !(Number(v) > 0) ? null : Math.round(Number(v) * 10000) / 10000);

async function fromYahoo(symbol: string, everyDay = false): Promise<Bar[]> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d`, { headers: UA });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  const ts: number[] = res?.timestamp || [];
  const q = res?.indicators?.quote?.[0] || {};
  const off = Number(res?.meta?.gmtoffset || 0);
  const bars: Bar[] = ts.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: num(q.close?.[i]) as number, open: num(q.open?.[i]), high: num(q.high?.[i]), low: num(q.low?.[i]), source: 'YAHOO' }))
    .filter((b) => b.close > 0);
  const live = num(res?.meta?.regularMarketPrice), liveT = Number(res?.meta?.regularMarketTime || 0);
  if (live && liveT) {
    const d = new Date((liveT + off) * 1000).toISOString().slice(0, 10);
    const b = bars.find((x) => x.date === d);
    if (b) b.close = live; else bars.push({ date: d, close: live, open: null, high: null, low: null, source: 'YAHOO' });
  }
  return everyDay ? bars : bars.filter((b) => weekday(b.date));
}

// 뉴욕 현지 날짜와 장 시작(09:30) 이후인지 — Yahoo 를 못 받았을 때 Google 값의 날짜를 정하는 데 사용
function nyNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, afterOpen: Number(p.hour) * 60 + Number(p.minute) >= 9 * 60 + 30 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1순위: Google 시트 (게시한 CSV)
  const g = new Map<string, number>();
  let sheetNote = '';
  try {
    const { data: setting } = await db.from('app_settings').select('value').eq('key', 'GSHEET_CSV_URL').maybeSingle();
    const csvUrl = Deno.env.get('GSHEET_CSV_URL') || setting?.value || '';
    if (!csvUrl) throw new Error('시트 주소 없음');
    const r = await fetch(csvUrl + (csvUrl.includes('?') ? '&' : '?') + 't=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    for (const line of (await r.text()).split(/\r?\n/)) {
      const [t, v] = line.split(',');
      const n = num(String(v ?? '').replace(/[",\s]/g, ''));
      if (t && n) g.set(t.trim().replace(/"/g, '').toUpperCase(), n);
    }
  } catch (e) { sheetNote = 'Google 시트를 읽지 못했습니다: ' + (e as Error).message; }

  const ny = nyNow();
  const result: Record<string, unknown> = {};
  for (const s of SERIES) {
    try {
      let bars: Bar[] = [], yErr = '';
      try { bars = await fromYahoo(s.yahoo, !!s.everyDay); } catch (e) { yErr = (e as Error).message; }
      // Google 값 = 오늘(가장 최근 거래일) 종가. 날짜는 Yahoo 의 최근 거래일, Yahoo 가 없으면 뉴욕 날짜(평일·장 시작 후)
      const gv = s.google ? g.get(s.google) : undefined;
      if (gv) {
        const d = bars.length ? bars[bars.length - 1].date : s.everyDay ? new Date().toISOString().slice(0, 10) : (weekday(ny.date) && ny.afterOpen ? ny.date : null);
        if (d) {
          const b = bars.find((x) => x.date === d);
          if (b) { b.close = gv; b.source = 'GOOGLE'; } else bars.push({ date: d, close: gv, open: null, high: null, low: null, source: 'GOOGLE' });
        }
      }
      if (!bars.length) { result[s.pair] = { ok: false, message: yErr || '데이터 없음' }; continue; }
      bars.sort((a, b) => (a.date < b.date ? -1 : 1));
      const { data: existing, error: e1 } = await db.from('fx_daily').select('date,source').eq('pair', s.pair).gte('date', bars[0].date);
      if (e1) throw new Error(e1.message);
      const csvDates = new Set((existing || []).filter((r) => r.source === 'CSV').map((r) => r.date));
      const rows = bars.filter((b) => !csvDates.has(b.date))
        .map((b) => ({ pair: s.pair, date: b.date, close: b.close, open: b.open, high: b.high, low: b.low, source: b.source, updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error: e2 } = await db.from('fx_daily').upsert(rows, { onConflict: 'pair,date' });
        if (e2) throw new Error(e2.message);
      }
      result[s.pair] = { ok: true, google: gv ?? null, saved: rows.map((r) => `${r.date} ${r.close} ${r.source}`), skippedCsv: bars.length - rows.length, yahooError: yErr || undefined };
    } catch (e) {
      result[s.pair] = { ok: false, message: (e as Error).message };
    }
  }
  // ---- Yahoo 가 아닌 출처 (Google Finance 에 없는 지표) ----
  const save = async (pair: string, list: { date: string; close: number }[], source: string) => {
    const rows = list.filter((r) => r.close != null && Number.isFinite(r.close))
      .map((r) => ({ pair, date: r.date, close: r.close, source, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await db.from('fx_daily').upsert(rows, { onConflict: 'pair,date' });
      if (error) throw new Error(error.message);
    }
    return rows.length;
  };
  const other = async (key: string, fn: () => Promise<string>) => {
    try { result[key] = { ok: true, saved: await fn() }; } catch (e) { result[key] = { ok: false, message: (e as Error).message }; }
  };
  const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json, text/plain, */*' };

  // 미국 국채금리: 미 재무부 공식 일별 금리(올해 CSV) → 10년 · 2년 · 장단기 금리차(10년 − 2년), 단위 %
  await other('UST', async () => {
    const y = new Date().getUTCFullYear();
    const r = await fetch(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { headers: UA });
    if (!r.ok) throw new Error('Treasury HTTP ' + r.status);
    const lines = (await r.text()).trim().split(/\r?\n/);
    const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
    const i2 = head.indexOf('2 Yr'), i10 = head.indexOf('10 Yr');
    const t10: { date: string; close: number }[] = [], t2: typeof t10 = [], sp: typeof t10 = [];
    for (const line of lines.slice(1, 16)) { // 최근 15거래일
      const c = line.split(',');
      const [m, d, yy] = c[0].split('/');
      const date = `${yy}-${m}-${d}`, a = Number(c[i10]), b = Number(c[i2]);
      if (a > 0) t10.push({ date, close: a });
      if (b > 0) t2.push({ date, close: b });
      if (a > 0 && b > 0) sp.push({ date, close: Math.round((a - b) * 100) / 100 });
    }
    return `10Y ${await save('UST10Y', t10, 'TREASURY')} · 2Y ${await save('UST2Y', t2, 'TREASURY')} · 차 ${await save('UST10Y2Y', sp, 'TREASURY')}`;
  });
  // 비트코인 원화 시세(업비트 일봉, 한국 날짜) — 김치 프리미엄 = 원화 시세 ÷ (달러 시세 × 환율) − 1
  await other('BTC_KRW', async () => {
    const r = await fetch('https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=10', { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('Upbit HTTP ' + r.status);
    const list = (await r.json() as { candle_date_time_kst: string; trade_price: number }[]).map((k) => ({ date: k.candle_date_time_kst.slice(0, 10), close: Number(k.trade_price) }));
    return String(await save('BTC_KRW', list, 'UPBIT'));
  });
  // 한국 국채 3년 (네이버 금융), 단위 %
  await other('KR3Y', async () => {
    const r = await fetch('https://m.stock.naver.com/front-api/marketIndex/prices?category=bond&reutersCode=KR3YT%3DRR&page=1&pageSize=10', { headers: UA });
    const list = ((await r.json())?.result || []).map((x: { localTradedAt: string; closePrice: string }) => ({ date: x.localTradedAt.slice(0, 10), close: Number(x.closePrice) }));
    if (!list.length) throw new Error('네이버 국채 3년 없음');
    return String(await save('KR3Y', list, 'NAVER'));
  });
  // KB 선도아파트 50 지수 (월간, 2008-12~), 날짜 = 그 달 1일
  await other('KB_LEAD50', async () => {
    const r = await fetch('https://data-api.kbland.kr/bfmstat/weekMnthlyHuseTrnd/leadApt50Indx', { headers: UA });
    const d = (await r.json())?.dataBody?.data;
    const dates: string[] = d?.['날짜리스트'] || [], vals: number[] = d?.['선도50지수리스트'] || [];
    if (!dates.length) throw new Error('KB 응답 없음');
    return String(await save('KB_LEAD50', dates.map((ym, i) => ({ date: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`, close: Math.round(Number(vals[i]) * 10000) / 10000 })), 'KB'));
  });
  // 미국 연준 통계(FRED, 무료 CSV): 하이일드 채권 스프레드(%) · M2 통화량(십억 달러, 월간)
  for (const [pair, id, monthly] of [['HY_OAS', 'BAMLH0A0HYM2', false], ['M2', 'M2SL', true]] as [string, string, boolean][]) {
    await other(pair, async () => {
      const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2016-10-01`, { headers: BROWSER });
      if (!r.ok) throw new Error('FRED HTTP ' + r.status);
      const list = (await r.text()).trim().split(/\r?\n/).slice(1).map((l) => { const [date, v] = l.split(','); return { date: monthly ? date.slice(0, 8) + '01' : date, close: Number(v) }; })
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.close > 0);
      if (!list.length) throw new Error('FRED 자료 없음');
      return String(await save(pair, list, 'FRED'));
    });
  }
  // CNN 공포·탐욕 지수 (0~100, 비공식)
  await other('FNG', async () => {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2016-10-10', { headers: { ...BROWSER, Referer: 'https://edition.cnn.com/', Origin: 'https://edition.cnn.com' } });
    if (!r.ok) throw new Error('CNN HTTP ' + r.status);
    const pts: { x: number; y: number }[] = (await r.json())?.fear_and_greed_historical?.data || [];
    if (!pts.length) throw new Error('CNN 자료 없음');
    const byDate = new Map<string, number>();
    pts.forEach((p) => byDate.set(new Date(p.x).toISOString().slice(0, 10), Math.round(p.y * 100) / 100));
    return String(await save('FNG', [...byDate].map(([date, close]) => ({ date, close })), 'CNN'));
  });

  return json({ ok: Object.values(result).every((r) => (r as { ok: boolean }).ok), sheetNote, result });
});
