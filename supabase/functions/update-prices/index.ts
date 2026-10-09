// update-prices — 현재가·환율을 가져와 DB(prices, fx_rates)에 저장합니다.
//
// 호출 방법
//   GET  ...?tickers=1          → Google 시트(IMPORTDATA)가 읽는 티커 목록 (한 줄에 하나)
//   POST ...?trigger=manual     → 사이트의 [↻ 시세 갱신] 버튼
//   POST ...?trigger=cron       → 매시 정각 자동 실행 (pg_cron)
//
// 가격 출처
//   GOOGLE : Google 시트의 GOOGLEFINANCE 결과 (웹에 게시한 CSV, 비밀값 GSHEET_CSV_URL)
//   UPBIT  : 업비트 공개 시세 API (원화 마켓)
//   GOLD   : KRX 금현물(1g) = 국제 금시세(XAU/USD, 온스) ÷ 31.1034768 × USD/KRW
//   CASH   : 항상 1 (저장하지 않음)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const TROY_OUNCE_G = 31.1034768;
const MIN_INTERVAL_MS = 60_000; // 너무 잦은 실행 방지 (공개 사이트이므로)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

// 간단한 CSV 파서 (따옴표·쉼표 포함 값 처리)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const toNum = (s: unknown) => {
  const n = Number(String(s ?? '').replace(/[,\s₩$]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: targets, error: tErr } = await db.from('price_targets').select('*').eq('active', true);
  if (tErr) return json({ ok: false, message: tErr.message }, 500);

  // 1) Google 시트가 읽어 갈 티커 목록
  if (url.searchParams.has('tickers')) {
    const list = ['CURRENCY:USDKRW', 'CURRENCY:XAUUSD',
      ...targets.filter((t) => t.source === 'GOOGLE' && t.google_ticker).map((t) => t.google_ticker)];
    return new Response(list.join('\n'), { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // 2) 시세 갱신
  const trigger = url.searchParams.get('trigger') === 'cron' ? 'cron' : 'manual';
  const { data: last } = await db.from('price_runs').select('started_at').order('started_at', { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - new Date(last[0].started_at).getTime() < MIN_INTERVAL_MS) {
    return json({ ok: false, message: '방금 갱신했습니다. 1분 뒤에 다시 시도해 주세요.' }, 429);
  }
  const { data: run } = await db.from('price_runs').insert({ trigger }).select('id').single();

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const failures: { symbol: string; exchange: string; reason: string }[] = [];
  const fail = (t: { symbol: string; exchange: string }, reason: string) => failures.push({ symbol: t.symbol, exchange: t.exchange, reason });

  // 2-1) Google 시트 (주식·ETF·환율·국제 금시세)
  const g = new Map<string, number>();
  const csvUrl = Deno.env.get('GSHEET_CSV_URL');
  let sheetNote = '';
  if (!csvUrl) sheetNote = 'Google 시트 주소(GSHEET_CSV_URL)가 아직 설정되지 않았습니다';
  else {
    try {
      const res = await fetch(csvUrl + (csvUrl.includes('?') ? '&' : '?') + 't=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      for (const r of parseCsv(await res.text())) {
        const ticker = String(r[0] ?? '').trim().toUpperCase();
        const price = toNum(r[1]);
        if (ticker && price) g.set(ticker, price);
      }
    } catch (e) { sheetNote = 'Google 시트를 읽지 못했습니다: ' + (e as Error).message; }
  }
  const fx = g.get('CURRENCY:USDKRW') ?? null;
  const xau = g.get('CURRENCY:XAUUSD') ?? null;

  for (const t of targets.filter((t) => t.source === 'GOOGLE')) {
    const p = t.google_ticker ? g.get(String(t.google_ticker).toUpperCase()) : null;
    if (p) rows.push({ symbol: t.symbol, exchange: t.exchange, price: p, currency: t.currency, source: 'GOOGLE', as_of: now, updated_at: now });
    else fail(t, sheetNote || `Google 시세 없음 (${t.google_ticker})`);
  }

  // 2-2) 업비트 (가상자산 원화 마켓). 없는 마켓이 섞이면 전체가 실패하므로 그때는 하나씩 다시 요청
  const upbit = targets.filter((t) => t.source === 'UPBIT' && t.upbit_market);
  const upPrice = new Map<string, number>();
  const fetchUpbit = async (markets: string[]) => {
    const res = await fetch('https://api.upbit.com/v1/ticker?markets=' + markets.join(','), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    for (const a of await res.json()) upPrice.set(a.market, Number(a.trade_price));
  };
  if (upbit.length) {
    try { await fetchUpbit(upbit.map((t) => t.upbit_market)); }
    catch { for (const t of upbit) { try { await fetchUpbit([t.upbit_market]); } catch { /* 아래에서 실패 처리 */ } } }
  }
  for (const t of upbit) {
    const p = upPrice.get(t.upbit_market);
    if (p && p > 0) rows.push({ symbol: t.symbol, exchange: t.exchange, price: p, currency: 'KRW', source: 'UPBIT', as_of: now, updated_at: now });
    else fail(t, `업비트 시세 없음 (${t.upbit_market})`);
  }

  // 2-3) 금현물: 국제 금시세를 현재 환율로 원화(1g) 환산
  for (const t of targets.filter((t) => t.source === 'GOLD')) {
    if (xau && fx) rows.push({ symbol: t.symbol, exchange: t.exchange, price: Math.round((xau / TROY_OUNCE_G) * fx * 100) / 100, currency: 'KRW', source: 'GOLD', as_of: now, updated_at: now });
    else fail(t, '국제 금시세 또는 환율이 없어 계산하지 못했습니다');
  }

  // 3) 저장
  if (rows.length) {
    const { error } = await db.from('prices').upsert(rows, { onConflict: 'symbol,exchange' });
    if (error) failures.push({ symbol: '*', exchange: '*', reason: '가격 저장 실패: ' + error.message });
  }
  const fxRows = [];
  if (fx) fxRows.push({ pair: 'USD/KRW', rate: fx, source: 'GOOGLE', as_of: now, updated_at: now });
  if (xau) fxRows.push({ pair: 'XAU/USD', rate: xau, source: 'GOOGLE', as_of: now, updated_at: now });
  if (fxRows.length) await db.from('fx_rates').upsert(fxRows, { onConflict: 'pair' });

  const message = [sheetNote, `성공 ${rows.length} · 실패 ${failures.length}`].filter(Boolean).join(' / ');
  if (run) await db.from('price_runs').update({ finished_at: new Date().toISOString(), ok_count: rows.length, fail_count: failures.length, failures, message }).eq('id', run.id);

  return json({ ok: true, trigger, as_of: now, updated: rows.length, failed: failures.length, fx, xau, message, failures });
});
