-- 전체 상장 종목 목록 (2026-10-09 적용됨) — 월 1회 sync-securities 함수가 갱신
create extension if not exists pg_trgm with schema extensions;
create table public.securities (
  symbol text not null,
  exchange text not null,             -- KRX / NASDAQ / NYSE / CBOE / UPBIT / CASH
  name text not null,
  eng_name text,
  asset_type text not null check (asset_type in ('ETF', 'STOCK', 'CRYPTO', 'GOLD', 'CASH')),
  currency text not null check (currency in ('KRW', 'USD')),
  market text,
  google_ticker text,
  upbit_market text,
  listed boolean not null default true,
  list_source text not null,          -- KIND / NAVER_ETF / NASDAQ_TRADER / UPBIT / MANUAL
  synced_at timestamptz not null default now(),
  primary key (symbol, exchange)
);
create index securities_name_trgm on public.securities using gin (name extensions.gin_trgm_ops);
create index securities_eng_trgm on public.securities using gin (eng_name extensions.gin_trgm_ops);
create index securities_symbol_idx on public.securities (upper(symbol));
create table public.securities_runs (
  id bigint generated always as identity primary key,
  trigger text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  delisted int not null default 0,
  message text
);
alter table public.securities enable row level security;
alter table public.securities_runs enable row level security;
create policy "public read securities" on public.securities for select to anon, authenticated using (true);
create policy "public read securities_runs" on public.securities_runs for select to anon, authenticated using (true);
insert into public.securities (symbol, exchange, name, eng_name, asset_type, currency, market, list_source) values
  ('CASH-KRW', 'CASH', '현금', 'Cash KRW', 'CASH', 'KRW', 'CASH', 'MANUAL'),
  ('CASH-USD', 'CASH', '달러 현금', 'Cash USD', 'CASH', 'USD', 'CASH', 'MANUAL'),
  ('RP-KRW', 'CASH', '원화 RP', 'KRW RP', 'CASH', 'KRW', 'CASH', 'MANUAL'),
  ('RP-USD', 'CASH', '달러 RP', 'USD RP', 'CASH', 'USD', 'CASH', 'MANUAL'),
  ('M04020000', 'KRX', 'KRX 금현물', 'KRX Gold Spot', 'GOLD', 'KRW', 'KRX 금시장', 'MANUAL');
alter table public.price_targets add column last_requested_at timestamptz;

-- 매월 1일 00:00 UTC (= 09:00 KST) 자동 갱신
select cron.schedule('sync-securities-monthly', '0 0 1 * *', $$
  select net.http_post(
    url := 'https://sertbrnhwpmuyfyryaov.supabase.co/functions/v1/sync-securities?trigger=cron',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
