-- 가장 최근 정상 한 건의 원자료 / 저장값 / 화면 표시 예정값 확인
select rate_date,
       raw_response ->> 'cur_nm' as source_currency,
       raw_response ->> 'deal_bas_r' as raw_value,
       rate as stored_value,
       to_char(rate, 'FM99,999,999,990.00') || '원' as display_value,
       replace(raw_response ->> 'deal_bas_r', ',', '')::numeric = rate as values_match,
       fetched_at at time zone 'Asia/Seoul' as fetched_at_kst,
       source_published_at
from public.exchange_rates
order by rate_date desc
limit 1;

-- 일별 성공 / 미수신 / 오류 기록
select rate_date, status, error_code,
       started_at at time zone 'Asia/Seoul' as started_at_kst,
       finished_at at time zone 'Asia/Seoul' as finished_at_kst
from public.exchange_fetch_runs
order by rate_date desc limit 30;
