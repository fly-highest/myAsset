// update-markets — 시장 지표 일별 종가를 DB(fx_daily)에 이어 붙입니다. (매시 15분 자동)
//   DXY 달러 인덱스 · WTI · BRENT 유가 · QQQ · SPY
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
const SERIES = [
  { pair: 'DXY', google: 'INDEXDXY:DXY', yahoo: 'DX-Y.NYB' },
  { pair: 'WTI', google: 'NYMEX:CLW00', yahoo: 'CL=F' },
  { pair: 'BRENT', google: 'NYMEX:BZW00', yahoo: 'BZ=F' },
  { pair: 'QQQ', google: 'NASDAQ:QQQ', yahoo: 'QQQ' },
  { pair: 'SPY', google: 'NYSEARCA:SPY', yahoo: 'SPY' }
];

type Bar = { date: string; close: number; open: number | null; high: number | null; low: number | null; source: string };
const weekday = (d: string) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w >= 1 && w <= 5; };
const num = (v: unknown) => (v == null || !(Number(v) > 0) ? null : Math.round(Number(v) * 10000) / 10000);

async function fromYahoo(symbol: string): Promise<Bar[]> {
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
  return bars.filter((b) => weekday(b.date));
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
      try { bars = await fromYahoo(s.yahoo); } catch (e) { yErr = (e as Error).message; }
      // Google 값 = 오늘(가장 최근 거래일) 종가. 날짜는 Yahoo 의 최근 거래일, Yahoo 가 없으면 뉴욕 날짜(평일·장 시작 후)
      const gv = g.get(s.google);
      if (gv) {
        const d = bars.length ? bars[bars.length - 1].date : (weekday(ny.date) && ny.afterOpen ? ny.date : null);
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
  return json({ ok: Object.values(result).every((r) => (r as { ok: boolean }).ok), sheetNote, result });
});
