// daily-snapshot — 매일 08:00 스냅샷을 서버에서 저장합니다 (화면을 열지 않아도). 매일 08:05 KST 자동 (pg_cron)
//   사용자 데이터(user_state.data)에 오늘 날짜 스냅샷이 없으면, 지금 보유 × 최근 시세(prices) · 환율(fx_rates)로 만들어 붙입니다.
//   계산은 화면(js/dataService.js makeSnapshot · addGoldToSnapshot, js/calc.js row)과 같습니다.
//   보호: app_settings 의 DAILY_SNAPSHOT_SECRET 과 같은 x-cron-secret 머리글이 있어야 실행 (예약 작업만 알고 있음)
//   이미 오늘 스냅샷이 있으면 아무것도 하지 않음 (화면이 먼저 만들었거나 두 번 불린 경우)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const TROY_OZ_G = 31.1034768;
const FALLBACK_GROUP = 'OTHER_STOCK';
const instKey = (symbol: unknown, exchange: unknown) => String(symbol || '').trim().toUpperCase() + '@' + String(exchange || '').trim().toUpperCase();
const pct = (p: number, i: number) => (i ? (p / i) * 100 : 0);
// deno-lint-ignore no-explicit-any
type Any = any;

// js/calc.js row() 와 같은 계산 (필요한 값만)
function row(h: Any, currency: string, price: number, fxEval: number) {
  const isUSD = currency === 'USD';
  const q = +h.quantity, ap = +h.avg_price, cp = +price;
  const fxBuy = isUSD ? +h.avg_fx_rate : 1, fxE = isUSD ? +fxEval : 1;
  const invO = q * ap, valO = q * cp;
  const invK = invO * fxBuy, valK = valO * fxE;
  const fxNow = +fxEval || 0;
  const uv = isUSD ? valO : fxNow ? valK / fxNow : 0, ui = isUSD ? invO : fxNow ? invK / fxNow : 0;
  return { invK, valK, uv, ui };
}

// 한국 날짜 (YYYY-MM-DD)
function todayKST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// js/dataService.js makeSnapshot + addGoldToSnapshot 과 같은 결과
function makeSnapshot(state: Any, date: string, prices: Map<string, number>, fxRate: number, xau: number | null, userId: string) {
  const id = 'snap-' + date, created = new Date().toISOString();
  const instMap = Object.fromEntries((state.instruments || []).map((i: Any) => [i.id, i]));
  const accMap = Object.fromEntries((state.accounts || []).map((a: Any) => [a.id, a]));
  const groupCodes = new Set((state.groups || []).map((g: Any) => g.code));
  const groupOf = (it: Any) => (it.asset_group && groupCodes.has(it.asset_group) ? it.asset_group : FALLBACK_GROUP);
  const manual = state.manualPrices || {};
  const entries = (state.holdings || []).map((h: Any) => {
    const inst = instMap[h.instrument_id], acc = accMap[h.account_id];
    if (!inst || !acc) return null;
    let price: number | null | undefined = inst.asset_type === 'CASH' ? 1 : prices.get(instKey(inst.symbol, inst.exchange));
    if (price == null && manual[inst.id]) price = Number(manual[inst.id].price); // 시세가 없으면 직접 입력한 현재가
    if (price == null) price = Number(h.avg_price); // 그것도 없으면 평균매입가
    return { account: acc, instrument: inst, holding: h, price };
  }).filter(Boolean);
  const items = entries.filter((e: Any) => e.holding.quantity > 0).map((e: Any, i: number) => {
    const inst = e.instrument, h = e.holding, isUSD = inst.currency === 'USD';
    const q = +h.quantity, ap = +h.avg_price, cp = +e.price;
    const invO = q * ap, valO = q * cp;
    return {
      id: id + '-' + i, snapshot_id: id, user_id: userId,
      account_id: e.account.id, account_name: e.account.name,
      instrument_id: inst.id, name: inst.name, symbol: inst.symbol, exchange: inst.exchange,
      asset_type: inst.asset_type, asset_group: inst.asset_group || FALLBACK_GROUP, currency: inst.currency,
      quantity: q, avg_price: ap, avg_fx_rate: isUSD ? +h.avg_fx_rate : 1,
      current_price: cp, current_price_currency: inst.currency,
      exchange_rate: fxRate, exchange_rate_pair: 'USD/KRW',
      value_original_currency: valO, invested_original_currency: invO,
      profit_original_currency: valO - invO, return_pct_original_currency: pct(valO - invO, invO),
      created_at: created
    } as Any;
  });
  // 원화 요약
  let inv = 0, val = 0;
  const gv: Record<string, number> = {}, gi: Record<string, number> = {};
  groupCodes.forEach((c) => { gv[c as string] = 0; gi[c as string] = 0; });
  gv[FALLBACK_GROUP] ??= 0; gi[FALLBACK_GROUP] ??= 0;
  items.forEach((it: Any) => {
    const r = row(it, it.currency, it.current_price, it.exchange_rate);
    inv += r.invK; val += r.valK; const g = groupOf(it); gv[g] += r.valK; gi[g] += r.invK;
  });
  Object.keys(gv).forEach((c) => { gv[c] = Math.round(gv[c]); gi[c] = Math.round(gi[c]); });
  const snapshot: Any = {
    id, user_id: userId, snapshot_date: date, snapshot_time: '08:00',
    total_value_krw: Math.round(val), total_invested_krw: Math.round(inv), total_profit_krw: Math.round(val - inv),
    total_return_pct: pct(val - inv, inv), exchange_rate: fxRate,
    group_values: gv, group_invested: gi, item_count: items.length, created_at: created, simulated: false,
    saved_by: 'server' // 서버 예약 작업이 저장 (화면이 저장한 것과 구분용)
  };
  // 금환산 (그 시점 국제 금시세)
  if (xau && xau > 0) {
    let tv = 0, ti = 0;
    const ggv: Record<string, number> = {}, ggi: Record<string, number> = {};
    items.forEach((it: Any) => {
      const r = row(it, it.currency, it.current_price, it.exchange_rate);
      it.value_gold_g = (r.uv / xau) * TROY_OZ_G;
      it.invested_gold_g = (r.ui / xau) * TROY_OZ_G;
      tv += it.value_gold_g; ti += it.invested_gold_g;
      const g = it.asset_group || FALLBACK_GROUP;
      ggv[g] = (ggv[g] || 0) + it.value_gold_g; ggi[g] = (ggi[g] || 0) + it.invested_gold_g;
    });
    const r2 = (v: number) => Math.round(v * 100) / 100;
    Object.keys(ggv).forEach((k) => { ggv[k] = r2(ggv[k]); ggi[k] = r2(ggi[k]); });
    Object.assign(snapshot, {
      xau_usd: xau, total_value_gold_g: r2(tv), total_invested_gold_g: r2(ti), total_profit_gold_g: r2(tv - ti),
      total_return_gold_pct: pct(tv - ti, ti), group_values_gold_g: ggv, group_invested_gold_g: ggi
    });
  }
  return { snapshot, items };
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // 예약 작업만 실행할 수 있게: 비밀값 확인
  const { data: sec } = await db.from('app_settings').select('value').eq('key', 'DAILY_SNAPSHOT_SECRET').maybeSingle();
  if (!sec?.value || req.headers.get('x-cron-secret') !== sec.value) return json({ ok: false, message: 'FORBIDDEN' }, 403);

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1'; // 시험: 계산만 하고 저장하지 않음 (이미 있어도 계산)
  const date = todayKST();
  // 시세 · 환율 · 금시세
  const [{ data: priceRows, error: e1 }, { data: fxRows, error: e2 }] = await Promise.all([
    db.from('prices').select('symbol,exchange,price'),
    db.from('fx_rates').select('pair,rate')
  ]);
  if (e1 || e2) return json({ ok: false, message: (e1 || e2)!.message }, 500);
  const prices = new Map<string, number>((priceRows || []).map((p: Any) => [instKey(p.symbol, p.exchange), Number(p.price)]));
  const fx = Object.fromEntries((fxRows || []).map((f: Any) => [f.pair, Number(f.rate)]));
  const fxRate = fx['USD/KRW'];
  if (!(fxRate > 0)) return json({ ok: false, message: '환율(USD/KRW)이 없습니다' }, 500);
  let xau: number | null = fx['XAU/USD'] || null;
  if (!xau) {
    const { data: last } = await db.from('fx_daily').select('close').eq('pair', 'XAU').order('date', { ascending: false }).limit(1).maybeSingle();
    xau = last ? Number(last.close) : null;
  }

  const { data: rows, error: e3 } = await db.from('user_state').select('user_id,data,rev');
  if (e3) return json({ ok: false, message: e3.message }, 500);
  const result: Record<string, unknown> = {};
  for (const r of rows || []) {
    try {
      const state = structuredClone(r.data || {}); // 원본(r.data)은 바꾸기 전 기록용으로 그대로 둠
      if (!state.meta?.realHistory) { result[r.user_id] = '건너뜀: 실제 이력 시작 전'; continue; }
      const snaps: Any[] = state.extraSnapshots || [];
      if (!dry && snaps.some((s) => s.snapshot?.snapshot_date === date)) { result[r.user_id] = `건너뜀: ${date} 스냅샷 이미 있음`; continue; }
      const snap = makeSnapshot(state, date, prices, fxRate, xau, state.meta?.userId || 'mock-user');
      if (dry) {
        const s = snap.snapshot;
        result[r.user_id] = { dry: true, items: s.item_count, value: s.total_value_krw, invested: s.total_invested_krw, groups: s.group_values, gold_g: s.total_value_gold_g };
        continue;
      }
      snaps.push(snap);
      state.extraSnapshots = snaps;
      state.meta.changedSinceSnapshot = false;
      state.meta.importBackup = null; // 되돌리기는 다음 스냅샷 전까지만 (화면과 같음)
      // 그 사이 다른 기기가 저장하지 않았을 때만 저장 (rev 가 그대로일 때)
      const { data: upd, error: e4 } = await db.from('user_state')
        .update({ data: state, rev: r.rev + 1, updated_at: new Date().toISOString() })
        .eq('user_id', r.user_id).eq('rev', r.rev).select('rev');
      if (e4) throw new Error(e4.message);
      if (!upd || !upd.length) { result[r.user_id] = '건너뜀: 저장 중 다른 기기가 먼저 저장 (다음 화면 열 때 화면이 저장)'; continue; }
      await db.from('user_state_history').insert({ user_id: r.user_id, rev: r.rev, data: r.data }); // 바꾸기 전 판 기록 (save_user_state 와 같음)
      result[r.user_id] = `저장: ${date} 08:00 · ${snap.items.length}종목 · 평가 ₩${snap.snapshot.total_value_krw.toLocaleString('ko-KR')}`;
    } catch (e) {
      result[r.user_id] = '오류: ' + (e as Error).message;
    }
  }
  return json({ ok: true, date, fxRate, xau, result });
});
