// sync-securities — 전체 상장 종목 목록을 외부에서 받아 DB(securities)에 저장합니다. (월 1회 자동 + 수동)
//
//   국내 주식 : KRX KIND 상장법인 목록 (코스피·코스닥·코넥스)
//   국내 ETF  : 네이버 금융 ETF 목록
//   미국      : NASDAQ Trader 공개 파일 (nasdaqlisted.txt / otherlisted.txt — NYSE·NYSE Arca·NYSE American·Cboe)
//   가상자산  : 업비트 원화 마켓
//
// 어느 출처를 못 받으면 그 출처의 기존 목록은 그대로 둡니다. (상장폐지 표시는 성공한 출처만)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const MIN_INTERVAL_MS = 10 * 60_000; // 수동 실행은 10분에 한 번
const UA = { 'User-Agent': 'Mozilla/5.0 (myAsset securities sync)' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

type Sec = {
  symbol: string; exchange: string; name: string; eng_name: string | null; asset_type: string; currency: string;
  market: string; google_ticker: string | null; upbit_market: string | null; list_source: string;
};

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

async function fetchKind(): Promise<Sec[]> {
  const res = await fetch('https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13', { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = new TextDecoder('euc-kr').decode(await res.arrayBuffer());
  const out: Sec[] = [];
  const MARKET: Record<string, string> = { '유가': 'KOSPI', '코스닥': 'KOSDAQ', '코넥스': 'KONEX' };
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1]));
    if (cells.length < 3) continue;
    const [name, mkt, codeRaw] = cells;
    const code = codeRaw.replace(/\D/g, '').padStart(6, '0');
    if (!name || code.length !== 6) continue;
    out.push({ symbol: code, exchange: 'KRX', name, eng_name: null, asset_type: 'STOCK', currency: 'KRW', market: MARKET[mkt] || mkt, google_ticker: 'KRX:' + code, upbit_market: null, list_source: 'KIND' });
  }
  if (out.length < 1000) throw new Error('목록이 너무 적습니다 (' + out.length + ')');
  return out;
}

async function fetchNaverEtf(): Promise<Sec[]> {
  const res = await fetch('https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc', { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = JSON.parse(new TextDecoder('euc-kr').decode(await res.arrayBuffer()));
  const list = body?.result?.etfItemList || [];
  const out: Sec[] = list.map((e: { itemcode: string; itemname: string }) => ({
    symbol: String(e.itemcode).trim(), exchange: 'KRX', name: String(e.itemname).trim(), eng_name: null, asset_type: 'ETF', currency: 'KRW',
    market: 'ETF', google_ticker: 'KRX:' + String(e.itemcode).trim(), upbit_market: null, list_source: 'NAVER_ETF'
  }));
  if (out.length < 300) throw new Error('목록이 너무 적습니다 (' + out.length + ')');
  return out;
}

const cleanUsName = (s: string) => s.replace(/\s+-\s+(Common Stock|Ordinary Shares?|Class [A-Z] (Common Stock|Ordinary Shares?))$/i, '').replace(/\s+Common Stock\s*$/i, '').trim();

async function fetchNasdaqTrader(): Promise<Sec[]> {
  const get = async (f: string) => {
    const r = await fetch('https://www.nasdaqtrader.com/dynamic/symdir/' + f, { headers: UA });
    if (!r.ok) throw new Error(f + ' HTTP ' + r.status);
    return (await r.text()).split(/\r?\n/).filter((l) => l && !l.startsWith('File Creation Time'));
  };
  const out: Sec[] = [];
  // nasdaqlisted: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  for (const line of (await get('nasdaqlisted.txt')).slice(1)) {
    const c = line.split('|');
    if (c.length < 7 || c[3] === 'Y' || c[0].includes('$')) continue;
    out.push({ symbol: c[0], exchange: 'NASDAQ', name: cleanUsName(c[1]), eng_name: c[1].trim(), asset_type: c[6] === 'Y' ? 'ETF' : 'STOCK', currency: 'USD', market: 'NASDAQ', google_ticker: 'NASDAQ:' + c[0], upbit_market: null, list_source: 'NASDAQ_TRADER' });
  }
  // otherlisted: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  const EX: Record<string, [string, string, string | null]> = {
    N: ['NYSE', 'NYSE', 'NYSE'], P: ['NYSE', 'NYSE Arca', 'NYSEARCA'], A: ['NYSE', 'NYSE American', 'NYSEAMERICAN'],
    Z: ['CBOE', 'Cboe BZX', 'BATS'], V: ['IEX', 'IEX', null]
  };
  for (const line of (await get('otherlisted.txt')).slice(1)) {
    const c = line.split('|');
    if (c.length < 7 || c[6] === 'Y' || c[0].includes('$')) continue;
    const ex = EX[c[2]];
    if (!ex) continue;
    out.push({ symbol: c[0], exchange: ex[0], name: cleanUsName(c[1]), eng_name: c[1].trim(), asset_type: c[4] === 'Y' ? 'ETF' : 'STOCK', currency: 'USD', market: ex[1], google_ticker: ex[2] ? ex[2] + ':' + c[0] : null, upbit_market: null, list_source: 'NASDAQ_TRADER' });
  }
  if (out.length < 5000) throw new Error('목록이 너무 적습니다 (' + out.length + ')');
  return out;
}

async function fetchUpbit(): Promise<Sec[]> {
  const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false', { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const list = (await r.json()) as { market: string; korean_name: string; english_name: string }[];
  return list.filter((m) => m.market.startsWith('KRW-')).map((m) => {
    const sym = m.market.slice(4);
    return { symbol: sym, exchange: 'UPBIT', name: m.korean_name, eng_name: m.english_name, asset_type: 'CRYPTO', currency: 'KRW', market: 'UPBIT', google_ticker: null, upbit_market: m.market, list_source: 'UPBIT' };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const trigger = url.searchParams.get('trigger') === 'cron' ? 'cron' : 'manual';

  if (trigger === 'manual') {
    const { data: last } = await db.from('securities_runs').select('started_at').order('started_at', { ascending: false }).limit(1);
    if (last?.[0] && Date.now() - new Date(last[0].started_at).getTime() < MIN_INTERVAL_MS) {
      return json({ ok: false, message: '종목 목록은 10분에 한 번만 최신화할 수 있습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    }
  }
  const { data: run } = await db.from('securities_runs').insert({ trigger }).select('id, started_at').single();
  const startedAt = run?.started_at ?? new Date().toISOString();

  const sources: [string, () => Promise<Sec[]>][] = [['KIND', fetchKind], ['NAVER_ETF', fetchNaverEtf], ['NASDAQ_TRADER', fetchNasdaqTrader], ['UPBIT', fetchUpbit]];
  const counts: Record<string, number | string> = {};
  const okSources: string[] = [];
  const all = new Map<string, Sec>();
  const results = await Promise.allSettled(sources.map(([, f]) => f()));
  results.forEach((r, i) => {
    const name = sources[i][0];
    if (r.status === 'fulfilled') {
      counts[name] = r.value.length;
      okSources.push(name);
      // 같은 심볼+거래소가 겹치면 ETF 목록(네이버)이 KIND 보다 우선 (ETF 는 KIND 에 없지만 혹시 모를 중복 대비)
      for (const s of r.value) all.set(s.symbol + '@' + s.exchange, s);
    } else counts[name] = '실패: ' + (r.reason as Error).message;
  });

  const now = new Date().toISOString();
  const rows = [...all.values()].map((s) => ({ ...s, listed: true, synced_at: now }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from('securities').upsert(rows.slice(i, i + 1000), { onConflict: 'symbol,exchange' });
    if (error) {
      await db.from('securities_runs').update({ finished_at: new Date().toISOString(), counts, message: '저장 실패: ' + error.message }).eq('id', run?.id);
      return json({ ok: false, message: '저장 실패: ' + error.message, counts }, 500);
    }
  }
  // 이번에 받은 출처에서 빠진 종목 → 상장폐지 등으로 표시 (목록에서 지우지는 않음)
  let delisted = 0;
  if (okSources.length) {
    const { data } = await db.from('securities').update({ listed: false }).in('list_source', okSources).lt('synced_at', startedAt).eq('listed', true).select('symbol');
    delisted = data?.length ?? 0;
  }
  const { count } = await db.from('securities').select('*', { count: 'exact', head: true }).eq('listed', true);
  const message = `상장 종목 ${count ?? rows.length}개 · 새로 받은 ${rows.length}개 · 상장폐지 표시 ${delisted}개` + (okSources.length < sources.length ? ' · 일부 출처 실패' : '');
  await db.from('securities_runs').update({ finished_at: new Date().toISOString(), counts, delisted, message }).eq('id', run?.id);
  return json({ ok: true, trigger, synced_at: now, total: count, counts, delisted, message });
});
