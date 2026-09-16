-- Supabase SQL Editor에서 전체 실행하세요. 기존 데이터를 삭제하지 않습니다.
begin;

create table if not exists public.exchange_rates (
  rate_date date primary key,
  currency text not null default 'USD' check (currency = 'USD'),
  raw_response jsonb not null,
  rate numeric(12,2) generated always as
    (replace(raw_response ->> 'deal_bas_r', ',', '')::numeric) stored,
  fetched_at timestamptz not null,
  source_published_at timestamptz,
  source_name text not null default '한국수출입은행',
  created_at timestamptz not null default now(),
  constraint valid_usd_raw check (
    raw_response ->> 'cur_unit' = 'USD'
    and regexp_replace(raw_response ->> 'cur_nm', '\s', '', 'g') = '미국달러'
    and raw_response ->> 'result' = '1'
    and raw_response ->> 'deal_bas_r' ~ '^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$'
    and rate > 0 and rate <= 99999999
  ),
  constraint required_raw_fields check (
    raw_response ?& array['cur_unit', 'cur_nm', 'result', 'deal_bas_r']
    and jsonb_typeof(raw_response -> 'deal_bas_r') = 'string'
    and jsonb_typeof(raw_response -> 'cur_unit') = 'string'
    and jsonb_typeof(raw_response -> 'cur_nm') = 'string'
    and jsonb_typeof(raw_response -> 'result') = 'number'
  )
);

-- 하루의 마지막 수집 상태. 빈 응답/오류도 남기지만 환율값을 만들어 저장하지 않습니다.
create table if not exists public.exchange_fetch_runs (
  rate_date date primary key,
  token uuid not null default gen_random_uuid(),
  status text not null check (status in ('pending', 'success', 'no_data', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text
);

alter table public.exchange_rates enable row level security;
alter table public.exchange_fetch_runs enable row level security;
revoke all on public.exchange_rates, public.exchange_fetch_runs from anon, authenticated;
grant select, insert, update on public.exchange_rates, public.exchange_fetch_runs to service_role;

-- DB가 전역 잠금을 담당합니다. 여러 서버리스 인스턴스가 동시에 호출해도
-- 날짜별로 10분에 한 번만 외부 API를 조회하며, 성공한 날짜는 다시 수집하지 않습니다.
create or replace function public.claim_exchange_fetch(p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare claimed uuid;
begin
  if p_date <> (now() at time zone 'Asia/Seoul')::date then
    raise exception 'Only the current Asia/Seoul date can be collected';
  end if;
  if exists (select 1 from public.exchange_rates where rate_date = p_date) then
    return null;
  end if;
  insert into public.exchange_fetch_runs as current_run (rate_date, status)
    values (p_date, 'pending')
  on conflict (rate_date) do update
    set token = gen_random_uuid(), status = 'pending', started_at = now(),
        finished_at = null, error_code = null
    where current_run.started_at <= now() - interval '10 minutes'
  returning token into claimed;
  return claimed;
end;
$$;

-- 원자료 저장과 수집 상태 갱신을 한 트랜잭션으로 처리합니다.
create or replace function public.finish_exchange_fetch(
  p_date date, p_token uuid, p_status text, p_raw jsonb,
  p_fetched_at timestamptz, p_error_code text
) returns boolean language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.exchange_fetch_runs
    where rate_date = p_date and token = p_token and status = 'pending' for update;
  if not found then return false; end if;
  if p_status not in ('success', 'no_data', 'error') then
    raise exception 'Invalid collection status';
  end if;
  if p_status = 'success' then
    if p_raw is null or p_fetched_at is null then raise exception 'Raw response is required'; end if;
    insert into public.exchange_rates(rate_date, raw_response, fetched_at)
      values (p_date, p_raw, p_fetched_at) on conflict (rate_date) do nothing;
  end if;
  update public.exchange_fetch_runs
    set status = p_status, finished_at = now(), error_code = p_error_code
    where rate_date = p_date and token = p_token;
  return true;
end;
$$;

revoke all on function public.claim_exchange_fetch(date) from public, anon, authenticated;
revoke all on function public.finish_exchange_fetch(date, uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.claim_exchange_fetch(date) to service_role;
grant execute on function public.finish_exchange_fetch(date, uuid, text, jsonb, timestamptz, text) to service_role;

comment on column public.exchange_rates.rate is '원자료 deal_bas_r에서 자동 생성한 원/1USD 매매기준율';
comment on column public.exchange_rates.rate_date is 'API searchdate로 조회한 기준일. Asia/Seoul';
comment on column public.exchange_rates.source_published_at is 'API 미제공: NULL 유지. 11시를 임의의 실제 고시 시각으로 저장하지 않음';
commit;
