import { FAILURE_PRESENTATION } from './status-copy.js';

const $ = (id) => document.getElementById(id);

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
  const presentation = FAILURE_PRESENTATION[status.error_code];
  $('notice-title').textContent = presentation?.title || '정상 상태로 회복했어요';
  $('notice-description').textContent = presentation?.description || '합성 다음 날짜가 저장되고 오류 상태가 해제됐습니다.';
  $('notice-detail').textContent = `${presentation?.action || '새 정상값과 전일 대비를 확인할 수 있습니다.'} ${data.sequence.join(' → ')} · 운영 데이터 변경 없음`;
  if (presentation) $('retry').textContent = presentation.button;
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
