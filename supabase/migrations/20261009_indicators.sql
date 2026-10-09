-- 투자 판단 지표 (2026-10-09 적용됨): QQQ 200일선 — update-indicators 함수가 매시 5분 갱신
create table public.indicators (
  key text primary key,                 -- QQQ_SMA200
  symbol text not null,
  exchange text not null,
  period int not null,
  value numeric not null,
  last_close numeric,
  last_close_date date,
  sample_count int not null,
  source text not null,                 -- YAHOO / NAVER
  as_of timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.indicators enable row level security;
create policy "public read indicators" on public.indicators for select to anon, authenticated using (true);
select cron.schedule('update-indicators-hourly', '5 * * * *', $$
  select net.http_post(
    url := 'https://sertbrnhwpmuyfyryaov.supabase.co/functions/v1/update-indicators',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
