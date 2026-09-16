import { money, shiftDate, timestamp, compareRates } from './format.js';

const $ = (id) => document.getElementById(id);
let dashboard = null;
let period = 7;
let showAll = false;
let loading = false;
const dateLabel = (value) => value ? value.replaceAll('-', '.') : '—';
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;

function text(id, value) { $(id).textContent = value; }
function notice(title, description, detail = '') {
  $('status-notice').hidden = !title;
  text('status-title', title);
  text('status-description', description);
  text('status-detail', detail);
}

function render(data) {
  const { latest, today, comparison, storage, attempt } = data;
  text('rate-number', latest ? money(latest.rate) : '—');
  $('rate-number').classList.remove('loading-number');
  text('rate-date', latest ? `기준일 ${dateLabel(latest.date)}` : `조회 대상 ${dateLabel(today)}`);
  text('meta-date', latest ? dateLabel(latest.date) : '데이터 없음');
  text('source-time', latest?.sourcePublishedAt ? timestamp(latest.sourcePublishedAt) : '제공되지 않음');
  text('fetched-time', latest ? timestamp(latest.fetchedAt) : '수신 기록 없음');
  text('queried-time', timestamp(data.queriedAt));
  const badge = $('data-badge');
  const isToday = latest?.date === today;
  badge.className = `badge${isToday ? '' : ' neutral'}`;
  badge.textContent = isToday ? '조회 완료' : latest ? '최근 확인값' : attempt?.status === 'error' ? '조회 실패' : '데이터 대기';

  const previous = data.records.find((row) => row.date === data.yesterday);
  const comparisonElement = $('comparison');
  if (comparison) {
    const direction = comparison.difference > 0 ? 'up' : comparison.difference < 0 ? 'down' : 'flat';
    comparisonElement.className = `comparison ${direction}`;
    comparisonElement.textContent = comparison.difference === 0 ? '어제와 같은 환율이에요' : `${comparison.difference > 0 ? '▲' : '▼'} 어제보다 ${money(Math.abs(comparison.difference))}원 ${comparison.difference > 0 ? '상승' : '하락'} (${signed(comparison.percent)}%)`;
    text('comparison-detail', `어제 ${money(previous.rate)}원 · ${dateLabel(data.yesterday)}`);
  } else {
    comparisonElement.className = 'comparison muted';
    comparisonElement.textContent = isToday ? '어제 기록이 없어 비교할 수 없어요' : '오늘 값이 없어 어제와 비교할 수 없어요';
    text('comparison-detail', isToday ? `비교 대상: ${dateLabel(data.yesterday)} · ${data.previousError ? '전일 조회 실패' : '기록 없음'}` : latest ? `최근 확인한 ${dateLabel(latest.date)} 기준 환율입니다.` : '데이터가 확인되면 환율을 표시할게요.');
  }

  const storageMessage = storage.issue ? `${storage.issue} ${latest?.persisted ? '마지막으로 읽은 저장값을 표시합니다.' : '아래 값은 영구 저장이 확인되지 않은 API 조회값입니다.'}` : !storage.configured ? '저장소 미연결 · 실제 API 조회값을 표시하고 있어요. Supabase 연결 전에는 일별 기록이 영구 저장되지 않습니다.' : '';
  $('storage-notice').hidden = !storageMessage;
  text('storage-notice', storageMessage);
  const lastAttempt = attempt?.finished_at || attempt?.started_at;
  const attemptDescription = `오늘 수집 확인 ${timestamp(lastAttempt)}${latest ? ` · 마지막 성공 수신 ${timestamp(latest.fetchedAt)}` : ''}`;
  if (data.issue) {
    notice('데이터 확인에 문제가 생겼어요', `${data.issue} ${latest ? `${dateLabel(latest.date)}의 마지막 확인값을 표시합니다.` : '확인되지 않은 환율을 대신 표시하지 않습니다.'}`, attemptDescription);
  } else if (!isToday) {
    const title = attempt?.status === 'pending' ? '오늘 데이터를 수집하고 있어요' : '오늘 데이터가 아직 도착하지 않았어요';
    const reason = attempt?.status === 'no_data' ? '출처에서 빈 응답을 받았어요. 휴일 또는 고시 전일 수 있지만 정확한 사유는 제공되지 않습니다.' : '현재 확인된 오늘의 환율 기록이 없습니다.';
    notice(title, `${reason} ${latest ? `최근 확인한 ${dateLabel(latest.date)} 값을 표시합니다.` : '정상 데이터가 확인되면 표시할게요.'}`, `${attemptDescription} · 재수집은 최대 10분 간격으로 시도합니다.`);
  } else notice('', '');

  $('verification').hidden = !latest;
  if (latest) {
    text('raw-rate', latest.raw.deal_bas_r);
    text('stored-rate', latest.persisted ? `${money(latest.rate)}원` : '저장 미확인');
    text('displayed-rate', `${money(latest.rate)}원`);
    text('verification-description', latest.persisted ? '정상 한 건의 원자료와 Supabase에서 다시 읽은 값, 화면의 숫자가 일치합니다. 쉼표와 소수점 자릿수만 보기 좋게 표시했어요.' : '실제 API 원자료와 화면값을 비교할 수 있어요. Supabase 저장값 일치 여부는 아직 확인되지 않았습니다.');
    text('raw-json', JSON.stringify(latest.raw, null, 2));
  }
  renderChart();
  renderHistory();
  text('screen-announcement', latest ? `${dateLabel(latest.date)} 미국 달러 환율 ${money(latest.rate)}원. ${comparisonElement.textContent}` : '조회 완료. 표시할 환율 데이터가 없습니다.');
}

function svgElement(name, attrs = {}, content) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (content !== undefined) element.textContent = content;
  return element;
}

function renderChart() {
  if (!dashboard) return;
  const container = $('chart');
  container.replaceChildren();
  const end = dashboard.today;
  const start = shiftDate(end, -(period - 1));
  const records = dashboard.records.filter((row) => row.date >= start && row.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  text('chart-subtitle', `${dateLabel(start)} — ${dateLabel(end)} · 원 / 1 USD`);
  text('chart-summary', '데이터가 없는 날짜는 연결하지 않습니다.');
  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    const icon = document.createElement('span'); icon.className = 'empty-chart-icon'; icon.textContent = '↗'; icon.setAttribute('aria-hidden', 'true');
    const message = document.createElement('p'); message.textContent = '이 기간에 확인된 환율 기록이 없어요';
    empty.append(icon, message); container.append(empty); return;
  }
  const compact = container.clientWidth < 500;
  const width = Math.max(container.clientWidth, 280);
  const height = container.clientHeight;
  const left = 48, right = 28, top = 27, bottom = 30;
  const min = Math.min(...records.map((r) => r.rate)), max = Math.max(...records.map((r) => r.rate));
  const padding = Math.max((max - min) * .35, 4);
  const low = Math.floor((min - padding) / 5) * 5;
  const high = Math.ceil((max + padding) / 5) * 5;
  const x = (date) => left + ((new Date(`${date}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) / (period - 1) * (width - left - right);
  const y = (rate) => top + (high - rate) / (high - low) * (height - top - bottom);
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'chart-a11y-title chart-a11y-desc' });
  svg.append(svgElement('title', { id: 'chart-a11y-title' }, `최근 ${period}일 미국 달러 환율`));
  svg.append(svgElement('desc', { id: 'chart-a11y-desc' }, records.map((r) => `${dateLabel(r.date)} ${money(r.rate)}원`).join(', ') + '. 데이터가 없는 날짜는 선을 연결하지 않습니다.'));
  for (let index = 0; index < 3; index++) {
    const value = low + (high - low) * index / 2;
    const coordinate = y(value);
    svg.append(svgElement('line', { x1: left, x2: width - right, y1: coordinate, y2: coordinate, class: 'chart-grid' }));
    svg.append(svgElement('text', { x: left - 10, y: coordinate + 4, 'text-anchor': 'end', class: 'chart-axis' }, Math.round(value).toLocaleString('ko-KR')));
  }
  const tickCount = compact ? 4 : period === 7 ? 7 : 6;
  for (let index = 0; index < tickCount; index++) {
    const date = shiftDate(start, Math.round(index * (period - 1) / (tickCount - 1)));
    svg.append(svgElement('text', { x: x(date), y: height - 5, 'text-anchor': 'middle', class: 'chart-axis' }, date.slice(5).replace('-', '.')));
  }
  let path = '';
  records.forEach((record, index) => {
    const consecutive = index > 0 && shiftDate(records[index - 1].date, 1) === record.date;
    path += `${consecutive ? 'L' : 'M'} ${x(record.date)} ${y(record.rate)} `;
  });
  svg.append(svgElement('path', { d: path, class: 'chart-line' }));
  records.forEach((record, index) => {
    const isLast = index === records.length - 1;
    const dot = svgElement('circle', { cx: x(record.date), cy: y(record.rate), r: isLast ? 5.5 : 4, class: 'chart-dot', tabindex: '0', 'aria-label': `${dateLabel(record.date)} ${money(record.rate)}원` });
    dot.append(svgElement('title', {}, `${dateLabel(record.date)} · ${money(record.rate)}원`));
    svg.append(dot);
    if (isLast) svg.append(svgElement('text', { x: Math.min(width - right, Math.max(left + 25, x(record.date))), y: y(record.rate) - 15, 'text-anchor': x(record.date) > width - 70 ? 'end' : 'middle', class: 'chart-value' }, money(record.rate)));
  });
  container.append(svg);
  text('chart-summary', records.length === 1 ? '첫 기록이에요. 다음 기록부터 변화를 확인할 수 있어요.' : `${records.length}일 기록 · 데이터가 없는 날짜는 연결하지 않습니다.`);
}

function renderHistory() {
  if (!dashboard) return;
  const all = dashboard.records;
  const rows = showAll ? all : all.slice(0, 5);
  text('record-count', `${all.length}건`);
  $('toggle-history').hidden = all.length <= 5;
  text('toggle-history', showAll ? '접기 ↑' : '전체 기록 ↗');
  const body = $('history-body');
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr'), cell = document.createElement('td');
    cell.colSpan = 4; cell.className = 'table-empty'; cell.textContent = '아직 확인된 기록이 없어요. 첫 수집을 기다리고 있습니다.';
    row.append(cell); body.append(row); return;
  }
  for (const record of rows) {
    const previous = all.find((r) => r.date === shiftDate(record.date, -1));
    const change = compareRates(record, previous);
    const row = document.createElement('tr');
    const dateCell = document.createElement('td');
    const dateContent = document.createElement('span'); dateContent.className = 'row-date'; dateContent.textContent = dateLabel(record.date);
    if (record.date === dashboard.today) { const tag = document.createElement('span'); tag.className = 'today-tag'; tag.textContent = '오늘'; dateContent.append(tag); }
    dateCell.append(dateContent);
    const rateCell = document.createElement('td'); rateCell.textContent = `${money(record.rate)}원`;
    const changeCell = document.createElement('td');
    changeCell.className = !change || change.difference === 0 ? 'muted' : change.difference > 0 ? 'up' : 'down';
    changeCell.textContent = change ? `${signed(change.difference)}원` : '비교 불가';
    if (!change) changeCell.title = `${dateLabel(shiftDate(record.date, -1))} 기록 없음`;
    const statusCell = document.createElement('td'), status = document.createElement('span');
    status.className = `table-badge${record.persisted ? '' : ' unstored'}`;
    status.textContent = record.persisted ? '정상 · 저장됨' : '조회 · 미저장'; statusCell.append(status);
    row.append(dateCell, rateCell, changeCell, statusCell); body.append(row);
  }
}

async function refresh() {
  if (loading) return;
  loading = true;
  $('refresh').disabled = true;
  $('refresh').classList.add('loading');
  $('rate-card').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/dashboard', { cache: 'no-store', signal: AbortSignal.timeout(55000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '정보판에 연결하지 못했어요.');
    dashboard = data;
    render(data);
  } catch (error) {
    const detail = error.name === 'TimeoutError' ? '응답 대기 시간이 초과됐어요. 잠시 후 다시 조회해 주세요.' : '네트워크 상태를 확인한 뒤 새로고침해 주세요.';
    notice('화면을 새로 조회하지 못했어요', dashboard?.latest ? '이전에 확인한 값을 유지하고 있어요. 최신 조회 결과가 아닙니다.' : '확인되지 않은 환율은 표시하지 않습니다.', detail);
    text('data-badge', '조회 실패'); $('data-badge').className = 'badge warning';
    if (!dashboard) {
      $('rate-number').classList.remove('loading-number');
      text('comparison', '현재 환율을 확인할 수 없어요');
      text('comparison-detail', '연결이 복구되면 다시 조회해 주세요.');
      text('rate-date', '기준일 확인 불가');
      text('chart', '환율 기록을 불러오지 못했어요.');
      $('chart').classList.add('chart-empty');
      const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 4; cell.className = 'table-empty'; cell.textContent = '기록을 불러오지 못했어요.'; row.append(cell); $('history-body').replaceChildren(row);
    }
    text('screen-announcement', '환율 조회에 실패했습니다. 새로고침으로 다시 시도할 수 있습니다.');
  } finally {
    loading = false;
    $('refresh').disabled = false;
    $('refresh').classList.remove('loading');
    $('rate-card').setAttribute('aria-busy', 'false');
  }
}

$('refresh').addEventListener('click', () => { $('chart').classList.remove('chart-empty'); refresh(); });
$('refresh').setAttribute('aria-label', '환율과 저장 기록 새로고침');
for (const button of document.querySelectorAll('[data-period]')) {
  button.addEventListener('click', () => {
    period = Number(button.dataset.period);
    for (const item of document.querySelectorAll('[data-period]')) { const selected = item === button; item.setAttribute('aria-pressed', String(selected)); item.classList.toggle('selected', selected); }
    renderChart();
  });
}
$('toggle-history').addEventListener('click', () => { showAll = !showAll; renderHistory(); });
function setNavigation() {
  for (const link of document.querySelectorAll('.nav-link')) {
    const active = link.hash === (location.hash === '#history' ? '#history' : '#today');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', setNavigation);
setNavigation();
new ResizeObserver(() => renderChart()).observe($('chart'));
refresh();
