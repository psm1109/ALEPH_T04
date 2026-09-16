const $ = (id) => document.getElementById(id);
const messages = {
  none: ['정상 상태로 회복했어요', '합성 다음 날짜가 저장되고 오류 상태가 해제됐습니다.'],
  timeout: ['출처 응답 시간이 초과됐어요', '마지막 정상값을 유지하며 시간 초과 상태를 별도로 표시합니다.'],
  auth: ['출처가 요청을 거절했어요', '외부 원천의 합성 401 응답입니다. 사이트 로그인 오류가 아닙니다.'],
  rate_limit: ['출처 호출 제한에 도달했어요', '마지막 정상값을 유지하고 합성 호출 제한 상태를 표시합니다.'],
  offline: ['출처에 연결할 수 없어요', '합성 오프라인 상태이며 확인되지 않은 값을 새로 만들지 않습니다.'],
  schema_error: ['출처 응답 형식이 달라졌어요', '필수 값의 자료형이 바뀌어 마지막 정상값을 유지합니다.'],
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
  $('fixture-id').textContent = data.fixture_id;
  $('row-count').textContent = `${data.row_count}건`;
  $('replay-count').textContent = `${data.row_count}건`;
  const badge = $('replay-badge');
  badge.className = `badge ${status.freshness === 'fresh' ? '' : 'warning'}`;
  badge.textContent = status.freshness === 'fresh' ? 'fresh · 정상' : 'stale · 오래된 값';
  const [title, description] = messages[status.error_code];
  $('notice-title').textContent = title;
  $('notice-description').textContent = description;
  $('notice-detail').textContent = `${data.sequence.join(' → ')} · 운영 데이터 변경 없음`;
  $('failure-notice').classList.toggle('recovered', status.freshness === 'fresh');
  $('retry').hidden = !data.retry_available;
  const rows = $('replay-rows');
  rows.replaceChildren(...records.map((record) => {
    const row = document.createElement('tr');
    for (const value of [record.record_id, record.record_date, `${record.normalized_value} ${record.unit}`, record.source_name]) {
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
