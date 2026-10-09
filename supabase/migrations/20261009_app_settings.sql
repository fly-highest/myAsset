-- 서버 전용 설정값 (2026-10-09 적용됨). 읽기 정책이 없어 사이트·외부에서는 조회할 수 없고 서버 함수만 사용
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- GSHEET_CSV_URL: 웹에 게시한 Google 시트(GOOGLEFINANCE) CSV 주소 — 값은 DB 에서 직접 관리 (저장소에 적지 않음)

-- 시세 대상의 구글 티커·이름을 실제 상장 목록(securities) 기준으로 바로잡고, 목록에 없는 대상은 제외
update public.price_targets t
set google_ticker = s.google_ticker, upbit_market = s.upbit_market, name = s.name, updated_at = now()
from public.securities s
where s.symbol = t.symbol and s.exchange = t.exchange
  and (t.google_ticker is distinct from s.google_ticker or t.upbit_market is distinct from s.upbit_market or t.name is distinct from s.name);
update public.price_targets t set active = false, updated_at = now()
where not exists (select 1 from public.securities s where s.symbol = t.symbol and s.exchange = t.exchange);
