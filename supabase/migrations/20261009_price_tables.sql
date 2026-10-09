-- myAsset 현재가 저장 (Supabase 프로젝트 myAsset, 서울) — 2026-10-09 적용됨
-- 1) 시세 수집 대상·최신 시세·환율·실행 기록 테이블
create table public.price_targets (
  symbol text not null,
  exchange text not null,
  name text,
  asset_type text not null,
  currency text not null check (currency in ('KRW', 'USD')),
  source text not null check (source in ('GOOGLE', 'UPBIT', 'GOLD', 'CASH')),
  google_ticker text,          -- 예: KRX:005930, NASDAQ:QQQ, NYSEARCA:VOO
  upbit_market text,           -- 예: KRW-BTC
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (symbol, exchange)
);
create table public.prices (
  symbol text not null,
  exchange text not null,
  price numeric not null check (price > 0),
  currency text not null check (currency in ('KRW', 'USD')),
  source text not null,
  as_of timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (symbol, exchange)
);
create table public.fx_rates (
  pair text primary key,            -- USD/KRW, XAU/USD
  rate numeric not null check (rate > 0),
  source text not null,
  as_of timestamptz not null,
  updated_at timestamptz not null default now()
);
create table public.price_runs (
  id bigint generated always as identity primary key,
  trigger text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok_count int not null default 0,
  fail_count int not null default 0,
  failures jsonb not null default '[]'::jsonb,
  message text
);
create index price_runs_started_at_idx on public.price_runs (started_at desc);

-- 2) 보안: 누구나 읽기만, 쓰기는 서버 함수(service role)만
alter table public.price_targets enable row level security;
alter table public.prices enable row level security;
alter table public.fx_rates enable row level security;
alter table public.price_runs enable row level security;
create policy "public read price_targets" on public.price_targets for select to anon, authenticated using (true);
create policy "public read prices" on public.prices for select to anon, authenticated using (true);
create policy "public read fx_rates" on public.fx_rates for select to anon, authenticated using (true);
create policy "public read price_runs" on public.price_runs for select to anon, authenticated using (true);

-- 3) 초기 수집 대상 = mock/catalog.js 의 외부 종목 목록 71개 (출처·구글 티커는 거래소·자산유형으로 자동 결정)
--    (실제 적용 SQL 은 Supabase 마이그레이션 기록 create_price_tables 참고)

-- 4) 매시 정각 자동 실행
create extension if not exists pg_cron;
create extension pg_net with schema extensions;
select cron.schedule(
  'update-prices-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://sertbrnhwpmuyfyryaov.supabase.co/functions/v1/update-prices?trigger=cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
