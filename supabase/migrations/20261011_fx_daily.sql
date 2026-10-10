-- 일별 USD/KRW 환율 (투자 화면의 기간 평균·차트용)
-- 과거: 업로드한 CSV(Investing.com 'USD_KRW Historical Data', 2016-10-10 ~ 2026-10-09, 2,610 거래일)를 1회 적재 (source = 'CSV')
-- 이후: 매시 10분 pg_cron 이 fx_rates 의 최신 USD/KRW 를 그 날짜(KST, 평일만)의 종가로 저장 (같은 날이면 덮어씀)
create table if not exists public.fx_daily (
  pair text not null default 'USD/KRW',
  date date not null,
  close numeric not null,
  open numeric,
  high numeric,
  low numeric,
  source text not null default 'CSV',
  updated_at timestamptz not null default now(),
  primary key (pair, date)
);
alter table public.fx_daily enable row level security;
drop policy if exists "fx_daily_public_read" on public.fx_daily;
create policy "fx_daily_public_read" on public.fx_daily for select to anon, authenticated using (true);
grant select on public.fx_daily to anon, authenticated;

create or replace function public.fx_daily_upsert_latest()
returns void language sql security definer set search_path = '' as $$
  -- 평일(월~금, KST)만: CSV 와 같이 거래일 기준으로 쌓음
  insert into public.fx_daily (pair, date, close, source, updated_at)
  select 'USD/KRW', d, rate, coalesce(source, 'LIVE'), now()
  from (select (as_of at time zone 'Asia/Seoul')::date d, rate, source from public.fx_rates where pair = 'USD/KRW' and rate > 0) x
  where extract(isodow from d) between 1 and 5
  on conflict (pair, date) do update
    set close = excluded.close, source = excluded.source, updated_at = now()
    where public.fx_daily.source <> 'CSV' or public.fx_daily.date >= (now() at time zone 'Asia/Seoul')::date;
$$;
revoke all on function public.fx_daily_upsert_latest() from public, anon, authenticated;
select cron.schedule('fx-daily-hourly', '10 * * * *', 'select public.fx_daily_upsert_latest()');
