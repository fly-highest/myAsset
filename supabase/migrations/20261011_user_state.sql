-- 사용자 데이터(계좌·보유·종목 매핑·목표 비중·자산군·증권 마스터·이력 등)를 사용자별 1행(JSON)으로 저장
-- 다른 PC·브라우저에서도 같은 데이터를 보도록 함. 본인(로그인한 사용자)만 읽고 쓸 수 있음 (RLS)
create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,          -- 저장할 때마다 1씩 증가 (동시 수정 감지용)
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;

drop policy if exists "user_state_select_own" on public.user_state;
create policy "user_state_select_own" on public.user_state
  for select to authenticated using ((select auth.uid()) = user_id);
-- 쓰기는 save_user_state 함수로만 (직접 insert/update 정책 없음)

-- 이전 버전 보관 (실수로 덮어써도 되돌릴 수 있게, 사용자별 최근 100개)
create table if not exists public.user_state_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  rev bigint not null,
  data jsonb not null,
  saved_at timestamptz not null default now()
);
create index if not exists user_state_history_user_idx on public.user_state_history (user_id, id desc);
alter table public.user_state_history enable row level security;
drop policy if exists "user_state_history_select_own" on public.user_state_history;
create policy "user_state_history_select_own" on public.user_state_history
  for select to authenticated using ((select auth.uid()) = user_id);

-- 저장: p_rev = 내가 마지막으로 읽은 rev (처음 저장이면 0).
-- 다른 기기가 그 사이 저장했으면 CONFLICT 오류 → 화면이 최신 데이터를 다시 읽음
create or replace function public.save_user_state(p_data jsonb, p_rev bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'BAD_DATA'; end if;
  if p_rev = 0 then
    insert into public.user_state (user_id, data, rev) values (v_uid, p_data, 1)
    on conflict (user_id) do nothing
    returning rev into v_rev;
  else
    insert into public.user_state_history (user_id, rev, data)
      select user_id, rev, data from public.user_state where user_id = v_uid and rev = p_rev;
    update public.user_state set data = p_data, rev = rev + 1, updated_at = now()
      where user_id = v_uid and rev = p_rev
      returning rev into v_rev;
  end if;
  if v_rev is null then raise exception 'CONFLICT'; end if;
  delete from public.user_state_history
    where user_id = v_uid
      and id not in (select id from public.user_state_history where user_id = v_uid order by id desc limit 100);
  return v_rev;
end;
$$;
revoke all on function public.save_user_state(jsonb, bigint) from public, anon;
grant execute on function public.save_user_state(jsonb, bigint) to authenticated;
grant select on public.user_state, public.user_state_history to authenticated;
