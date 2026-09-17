const $ = (id) => document.getElementById(id);
const failures = {
  timeout: ['출처 API 응답 대기 시간이 초과됐어요.', '잠시 후 다시 조회해 주세요.'],
  auth: ['출처 API 인증에 실패했어요.', '서비스 관리자에게 API 인증 설정 확인을 요청해 주세요.'],
  rate_limit: ['출처 API의 호출 한도에 도달했어요.', '호출 한도가 초기화된 뒤 다시 조회해 주세요.'],
  offline: ['출처 API에 연결하지 못했어요.', '네트워크 연결을 확인한 뒤 다시 조회해 주세요.'],
  schema_error: ['출처 데이터 형식을 확인할 수 없어요.', '서비스 관리자에게 출처 데이터 형식 확인을 요청해 주세요.'],
};

function render(data) {
  const { status, records } = data;
  const current = records.at(-1);
  $('stored-value').textContent = data.stored_value ?? '—';
  $('stored-unit').textContent = current?.unit || 'pt';
  $('record-date').textContent = data.record_date ? `합성 기준일 ${data.record_date}` : '합성 기록 없음';
  $('delta-value').textContent = data.delta === null ? '비교 불가' : `${data.delta > 0 ? '+' : ''}${data.delta} ${current?.unit || ''}`;
  $('freshness').textContent = status.freshness;
  $('error-code').textContent = status.error_code;
  $('row-count').textContent = `${data.row_count}건`;
  $('replay-count').textContent = `${data.row_count}건`;
  const badge = $('replay-badge');
  badge.className = `badge ${status.freshness === 'fresh' ? '' : 'warning'}`;
  badge.textContent = status.freshness === 'fresh' ? 'fresh · 정상' : 'stale · 오래된 값';
  const failure = failures[status.error_code];
  $('failure-notice').hidden = !failure;
  if (failure) {
    $('notice-title').textContent = '데이터 확인에 문제가 생겼어요';
    $('notice-description').textContent = `${failure[0]} ${data.record_date.replaceAll('-', '.')}의 마지막 확인값을 표시합니다.`;
    $('notice-detail').textContent = `${failure[1]} 마지막 정상 수신 ${new Date(current.fetched_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
    $('retry').textContent = '다시 조회';
  }
  $('retry').hidden = !data.retry_available;
  const rows = $('replay-rows');
  rows.replaceChildren(...records.map((record, index) => {
    const row = document.createElement('tr');
    const previous = records[index - 1];
    const delta = previous ? record.normalized_value - previous.normalized_value : null;
    for (const value of [record.record_date, `${record.normalized_value} ${record.unit}`, delta === null ? '비교 불가' : `${delta > 0 ? '+' : ''}${delta} ${record.unit}`, '정상 · 저장됨']) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    return row;
  }));
  $('replay-result').setAttribute('aria-busy', 'false');
}

async function run(scenario) {
  $('replay-result').setAttribute('aria-busy', 'true');
  for (const button of document.querySelectorAll('[data-scenario]')) button.disabled = true;
  $('retry').disabled = true;
  try {
    const response = await fetch(`/api/replay?scenario=${encodeURIComponent(scenario)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '합성 재생에 실패했어요.');
    render(data);
  } catch (error) {
    $('notice-title').textContent = '합성 재생 화면을 불러오지 못했어요';
    $('notice-description').textContent = error.message;
  } finally {
    for (const button of document.querySelectorAll('[data-scenario]')) button.disabled = false;
    $('retry').disabled = false;
  }
}

for (const button of document.querySelectorAll('[data-scenario]')) button.addEventListener('click', () => run(button.dataset.scenario));
$('retry').addEventListener('click', () => run('recover'));
run('baseline');
