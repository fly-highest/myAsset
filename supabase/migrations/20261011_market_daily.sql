-- 시장 지표 일별 종가 (fx_daily 테이블을 함께 사용, pair 로 구분)
--   'DXY' 달러 인덱스 · 'WTI' WTI유 선물 · 'BRENT' 브렌트유 선물
-- 과거: 업로드한 CSV(Investing.com '…과거 데이터')를 적재 (source = 'CSV'): 2021-10-11~ 먼저, 이어서 2016-10-10 ~ 2026-10-09 전체
-- 이후: Edge Function update-markets (Yahoo DX-Y.NYB / CL=F / BZ=F) 를 매시 15분 실행 → 최근 며칠치를 source = 'YAHOO' 로 추가·갱신
--       (CSV 로 넣은 날짜는 덮어쓰지 않음, 평일만)
select cron.schedule('update-markets-hourly', '15 * * * *', $$
  select net.http_post(
    url := 'https://sertbrnhwpmuyfyryaov.supabase.co/functions/v1/update-markets',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
