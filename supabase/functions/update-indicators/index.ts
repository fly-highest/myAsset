// update-indicators — 투자 판단 지표를 계산해 DB(indicators)에 저장합니다. (매시 5분 자동 + 사이트 [↻ 시세 갱신])
//   QQQ_SMA200 : QQQ 최근 200거래일 종가 평균 (200일 이동평균선)
//   일별 종가 출처: Yahoo Finance 차트 → 실패하면 네이버 금융 해외 일별 시세
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const UA = { 'User-Agent': 'Mozilla/5.0' };

type Daily = { date: string; close: number };

// Yahoo: 2년치 일봉 (미국 현지 날짜 기준)
async function fromYahoo(symbol: string): Promise<Daily[]> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`, { headers: UA });
  if (!r.ok) throw new Error('Yahoo HTTP ' + r.status);
  const res = (await r.json())?.chart?.result?.[0];
  const ts: number[] = res?.timestamp || [];
  const close: (number | null)[] = res?.indicators?.quote?.[0]?.close || [];
  const off = Number(res?.meta?.gmtoffset || 0);
  return ts.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), close: Number(close[i]) }))
    .filter((d) => d.close > 0);
}
// 네이버: 해외 일별 시세 (QQQ.O = 나스닥 상장)
async function fromNaver(symbol: string): Promise<Daily[]> {
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const end = new Date(), start = new Date(Date.now() - 420 * 86400_000);
  const r = await fetch(`https://api.stock.naver.com/chart/foreign/item/${symbol}.O/day?startDateTime=${ymd(start)}0000&endDateTime=${ymd(end)}2359`, { headers: UA });
  if (!r.ok) throw new Error('Naver HTTP ' + r.status);
  return ((await r.json()) as { localDate: string; closePrice: number }[])
    .map((d) => ({ date: `${d.localDate.slice(0, 4)}-${d.localDate.slice(4, 6)}-${d.localDate.slice(6, 8)}`, close: Number(d.closePrice) }))
    .filter((d) => d.close > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const symbol = 'QQQ', period = 200;

  let daily: Daily[] = [], source = '';
  const errors: string[] = [];
  try { daily = await fromYahoo(symbol); source = 'YAHOO'; } catch (e) { errors.push((e as Error).message); }
  if (daily.length < period) {
    try { daily = await fromNaver(symbol); source = 'NAVER'; } catch (e) { errors.push((e as Error).message); }
  }
  if (daily.length < period) return json({ ok: false, message: `일별 종가가 ${period}개보다 적습니다 (${daily.length}개)`, errors }, 500);

  const last = daily.slice(-period);
  const sma = last.reduce((s, d) => s + d.close, 0) / period;
  const row = {
    key: `${symbol}_SMA${period}`, symbol, exchange: 'NASDAQ', period,
    value: Math.round(sma * 100) / 100,
    last_close: daily[daily.length - 1].close, last_close_date: daily[daily.length - 1].date,
    sample_count: period, source, as_of: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const { error } = await db.from('indicators').upsert(row, { onConflict: 'key' });
  if (error) return json({ ok: false, message: error.message }, 500);
  return json({ ok: true, ...row, from: last[0].date, to: last[last.length - 1].date, errors });
});
