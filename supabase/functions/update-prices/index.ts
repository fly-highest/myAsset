// update-prices — 현재가·환율을 가져와 DB(prices, fx_rates)에 저장합니다.
//
// 호출 방법
//   GET  ...?tickers=1          → Google 시트(IMPORTDATA)가 읽는 티커 목록 (한 줄에 하나)
//   POST ...?trigger=manual     → 사이트의 [↻ 시세 갱신] 버튼
//   POST ...?trigger=cron       → 매시 정각 자동 실행 (pg_cron)
//   POST ...?track=1 {items}    → 사이트가 쓰는 종목을 시세 대상으로 등록 (전체 종목 목록에 있는 것만)
//
// 가격 출처
//   GOOGLE : Google 시트의 GOOGLEFINANCE 결과 (웹에 게시한 CSV, 비밀값 GSHEET_CSV_URL 또는 app_settings)
//   NAVER  : 국내 ETF 중 Google 시세가 없는 종목은 네이버 금융 ETF 시세로 대체
//   UPBIT  : 업비트 공개 시세 API (원화 마켓)
//   GOLD   : KRX 금현물(원/g) = 네이버 금융 KRX 금 시세 (실패 시 국제 금시세 ÷ 31.1034768 × USD/KRW)
//   환율·금시세가 Google 에 없으면: 환율 open.er-api.com(일 1회), 금 api.gold-api.com(실시간)
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

  // 0) 사이트가 쓰는 종목을 시세 대상으로 등록 (전체 종목 목록 securities 에 있는 종목만)
  if (url.searchParams.has('track')) {
    let items: { symbol?: string; exchange?: string }[] = [];
    try { items = ((await req.json()).items || []).slice(0, 300); } catch { /* 빈 요청 */ }
    const want = new Set(items.filter((x) => x?.symbol && x?.exchange).map((x) => String(x.symbol).toUpperCase() + '@' + String(x.exchange).toUpperCase()));
    if (!want.size) return json({ ok: true, tracked: 0 });
    const symbols = [...new Set([...want].map((k) => k.split('@')[0]))];
    const { data: secs } = await db.from('securities').select('symbol,exchange,name,asset_type,currency,google_ticker,upbit_market').in('symbol', symbols);
    const now = new Date().toISOString();
    const rows = (secs || []).filter((s) => want.has(s.symbol.toUpperCase() + '@' + s.exchange)).map((s) => ({
      symbol: s.symbol, exchange: s.exchange, name: s.name, asset_type: s.asset_type, currency: s.currency,
      source: s.asset_type === 'CASH' ? 'CASH' : s.exchange === 'UPBIT' ? 'UPBIT' : s.asset_type === 'GOLD' ? 'GOLD' : 'GOOGLE',
      google_ticker: s.google_ticker, upbit_market: s.upbit_market, active: true, last_requested_at: now, updated_at: now
    }));
    if (rows.length) await db.from('price_targets').upsert(rows, { onConflict: 'symbol,exchange' });
    return json({ ok: true, tracked: rows.length, unknown: want.size - rows.length });
  }

  const { data: targets, error: tErr } = await db.from('price_targets').select('*').eq('active', true);
  if (tErr) return json({ ok: false, message: tErr.message }, 500);

  // 1) Google 시트가 읽어 갈 티커 목록
  if (url.searchParams.has('tickers')) {
    // 시장 지표(update-markets)용: QQQ · SPY · GLD · 비트코인 (달러 인덱스 · WTI · 브렌트유는 GOOGLEFINANCE 가 값을 주지 않아 Yahoo 사용, 2026-10-10 확인)
    const list = ['CURRENCY:USDKRW', 'CURRENCY:XAUUSD', 'NASDAQ:QQQ', 'NYSEARCA:SPY', 'NYSEARCA:GLD', 'CURRENCY:BTCUSD',
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
  // 시트 주소: 비밀값(GSHEET_CSV_URL) 또는 서버 전용 설정 표(app_settings)
  let csvUrl = Deno.env.get('GSHEET_CSV_URL') || '';
  if (!csvUrl) {
    const { data: setting } = await db.from('app_settings').select('value').eq('key', 'GSHEET_CSV_URL').maybeSingle();
    csvUrl = setting?.value || '';
  }
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
  // 환율·국제 금시세: Google 값이 없으면 무료 공개 API 로 대체
  //   환율 USD/KRW → open.er-api.com (하루 1회 갱신되는 기준 환율)
  //   금 XAU/USD  → api.gold-api.com (실시간)
  let fx = g.get('CURRENCY:USDKRW') ?? null, fxSource = 'GOOGLE';
  let xau = g.get('CURRENCY:XAUUSD') ?? null, xauSource = 'GOOGLE';
  if (!fx) {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      const v = Number((await r.json())?.rates?.KRW);
      if (v > 0) { fx = Math.round(v * 100) / 100; fxSource = 'ER_API'; }
    } catch { /* 환율 없음 */ }
  }
  if (!xau) {
    try {
      const r = await fetch('https://api.gold-api.com/price/XAU');
      const v = Number((await r.json())?.price);
      if (v > 0) { xau = Math.round(v * 100) / 100; xauSource = 'GOLD_API'; }
    } catch { /* 금시세 없음 */ }
  }

  // 국내 ETF 는 Google 에 시세가 없으면 네이버 금융 ETF 시세로 대신합니다 (한 번만 받아 재사용)
  let naver: Map<string, number> | null = null;
  const naverEtf = async () => {
    if (naver) return naver;
    naver = new Map();
    try {
      const r = await fetch('https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc', { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const body = JSON.parse(new TextDecoder('euc-kr').decode(await r.arrayBuffer()));
      for (const e of body?.result?.etfItemList || []) if (Number(e.nowVal) > 0) naver.set(String(e.itemcode), Number(e.nowVal));
    } catch { /* 네이버 실패 시 대체 없음 */ }
    return naver;
  };
  for (const t of targets.filter((t) => t.source === 'GOOGLE')) {
    const p = t.google_ticker ? g.get(String(t.google_ticker).toUpperCase()) : null;
    if (p) { rows.push({ symbol: t.symbol, exchange: t.exchange, price: p, currency: t.currency, source: 'GOOGLE', as_of: now, updated_at: now }); continue; }
    const n = t.exchange === 'KRX' && t.asset_type === 'ETF' ? (await naverEtf()).get(t.symbol) : null;
    if (n) rows.push({ symbol: t.symbol, exchange: t.exchange, price: n, currency: 'KRW', source: 'NAVER', as_of: now, updated_at: now });
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

  // 2-3) KRX 금현물(원/g): 네이버 금융의 KRX 금 시세(기준 시각 = 실제 체결 시각)
  //      네이버를 못 받으면 국제 금시세 × 환율로 환산 (국내 가격과 1~2% 차이 날 수 있음)
  for (const t of targets.filter((t) => t.source === 'GOLD')) {
    let done = false;
    try {
      const r = await fetch('https://api.stock.naver.com/marketindex/metals/' + encodeURIComponent(t.symbol), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const d = await r.json();
      const p = toNum(d?.closePrice);
      if (p) {
        rows.push({ symbol: t.symbol, exchange: t.exchange, price: p, currency: 'KRW', source: 'NAVER', as_of: d.localTradedAt ? new Date(d.localTradedAt).toISOString() : now, updated_at: now });
        done = true;
      }
    } catch { /* 아래 국제 금시세 환산으로 대체 */ }
    if (done) continue;
    if (xau && fx) rows.push({ symbol: t.symbol, exchange: t.exchange, price: Math.round((xau / TROY_OUNCE_G) * fx * 100) / 100, currency: 'KRW', source: 'GOLD', as_of: now, updated_at: now });
    else fail(t, '네이버 금 시세와 국제 금시세를 모두 받지 못했습니다');
  }

  // 3) 저장
  if (rows.length) {
    const { error } = await db.from('prices').upsert(rows, { onConflict: 'symbol,exchange' });
    if (error) failures.push({ symbol: '*', exchange: '*', reason: '가격 저장 실패: ' + error.message });
  }
  const fxRows = [];
  if (fx) fxRows.push({ pair: 'USD/KRW', rate: fx, source: fxSource, as_of: now, updated_at: now });
  if (xau) fxRows.push({ pair: 'XAU/USD', rate: xau, source: xauSource, as_of: now, updated_at: now });
  if (fxRows.length) await db.from('fx_rates').upsert(fxRows, { onConflict: 'pair' });

  // 45일 동안 사이트에서 요청이 없던 종목은 시세 대상에서 제외 (Google 시트 부담 줄이기)
  await db.from('price_targets').update({ active: false }).lt('last_requested_at', new Date(Date.now() - 45 * 86400_000).toISOString());

  const message = [sheetNote, `성공 ${rows.length} · 실패 ${failures.length}`].filter(Boolean).join(' / ');
  if (run) await db.from('price_runs').update({ finished_at: new Date().toISOString(), ok_count: rows.length, fail_count: failures.length, failures, message }).eq('id', run.id);

  return json({ ok: true, trigger, as_of: now, updated: rows.length, failed: failures.length, fx, fxSource, xau, xauSource, message, failures });
});
