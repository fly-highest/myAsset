// update-markets — 시장 지표 일별 종가를 DB(fx_daily)에 이어 붙입니다. (매시 15분 자동)
//   DXY = 달러 인덱스 (Yahoo DX-Y.NYB), WTI = WTI유 선물 (CL=F), BRENT = 브렌트유 선물 (BZ=F)
//   과거 자료는 업로드한 CSV(Investing.com, source = 'CSV')이고, 이 함수는 최근 며칠치를 source = 'YAHOO' 로 추가·갱신합니다.
//   CSV 로 넣은 날짜는 덮어쓰지 않습니다. 날짜는 거래소 현지 날짜 (Investing.com 과 같은 기준)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const UA = { 'User-Agent': 'Mozilla/5.0' };
const SERIES: [string, string][] = [['DXY', 'DX-Y.NYB'], ['WTI', 'CL=F'], ['BRENT', 'BZ=F']];

type Bar = { date: string; close: number; open: number | null; high: number | null; low: number | null };

async function fromYahoo(symbol: string): Promise<Bar[]> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d`, { headers: UA });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  const res = (await r.json())?.chart?.result?.[0];
  const ts: number[] = res?.timestamp || [];
  const q = res?.indicators?.quote?.[0] || {};
  const off = Number(res?.meta?.gmtoffset || 0);
  const num = (v: unknown) => (v == null || !(Number(v) > 0) ? null : Math.round(Number(v) * 10000) / 10000);
  const bars = ts.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: num(q.close?.[i]) as number, open: num(q.open?.[i]), high: num(q.high?.[i]), low: num(q.low?.[i]) }))
    .filter((b) => b.close > 0);
  // 오늘 진행 중인 값: 일봉에 아직 없으면 현재가(regularMarketPrice)로
  const live = num(res?.meta?.regularMarketPrice), liveT = Number(res?.meta?.regularMarketTime || 0);
  if (live && liveT) {
    const d = new Date((liveT + off) * 1000).toISOString().slice(0, 10);
    const b = bars.find((x) => x.date === d);
    if (b) b.close = live; else bars.push({ date: d, close: live, open: null, high: null, low: null });
  }
  return bars;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const result: Record<string, unknown> = {};
  for (const [pair, symbol] of SERIES) {
    try {
      const bars = (await fromYahoo(symbol)).filter((b) => { const w = new Date(b.date + 'T00:00:00Z').getUTCDay(); return w >= 1 && w <= 5; });
      if (!bars.length) { result[pair] = { ok: false, message: '데이터 없음' }; continue; }
      const { data: existing, error: e1 } = await db.from('fx_daily').select('date,source').eq('pair', pair).gte('date', bars[0].date);
      if (e1) throw new Error(e1.message);
      const csvDates = new Set((existing || []).filter((r) => r.source === 'CSV').map((r) => r.date));
      const rows = bars.filter((b) => !csvDates.has(b.date))
        .map((b) => ({ pair, date: b.date, close: b.close, open: b.open, high: b.high, low: b.low, source: 'YAHOO', updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error: e2 } = await db.from('fx_daily').upsert(rows, { onConflict: 'pair,date' });
        if (e2) throw new Error(e2.message);
      }
      result[pair] = { ok: true, saved: rows.map((r) => `${r.date} ${r.close}`), skippedCsv: bars.length - rows.length };
    } catch (e) {
      result[pair] = { ok: false, message: (e as Error).message };
    }
  }
  return json({ ok: Object.values(result).every((r) => (r as { ok: boolean }).ok), result });
});
