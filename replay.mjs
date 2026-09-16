const NORMALIZED_KEYS = Object.freeze([
  'signal_id', 'normalized_value', 'unit', 'source_name', 'source_url',
  'source_time', 'fetched_at', 'record_timezone', 'record_date',
]);

export const ERROR_CODES = Object.freeze(['timeout', 'auth', 'rate_limit', 'offline', 'schema_error']);

const clone = (value) => structuredClone(value);

export function kstDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) throw new TypeError('fetched_at must be a valid ISO-8601 date-time');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateNormalizedReading(reading) {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) throw new TypeError('normalized reading must be an object');
  const actual = Object.keys(reading).sort();
  const expected = [...NORMALIZED_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError('normalized reading fields do not match the contract');
  if (typeof reading.signal_id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(reading.signal_id) || reading.signal_id.length > 100) throw new TypeError('signal_id is invalid');
  if (typeof reading.normalized_value !== 'number' || !Number.isFinite(reading.normalized_value)) throw new TypeError('normalized_value must be finite');
  for (const field of ['unit', 'source_name']) if (typeof reading[field] !== 'string' || !reading[field].trim()) throw new TypeError(`${field} must be non-empty`);
  let sourceUrl;
  try { sourceUrl = new URL(reading.source_url); } catch { throw new TypeError('source_url must be absolute'); }
  if (sourceUrl.protocol !== 'https:') throw new TypeError('source_url must use HTTPS');
  if (reading.source_time !== null && Number.isNaN(new Date(reading.source_time).getTime())) throw new TypeError('source_time is invalid');
  if (reading.record_timezone !== 'Asia/Seoul') throw new TypeError('record_timezone must be Asia/Seoul');
  if (reading.record_date !== kstDate(reading.fetched_at)) throw new TypeError('record_date must match fetched_at in Asia/Seoul');
}

export function resetReplayState() {
  return {
    schema_version: 'aleph-t04-evaluation-state-v1', daily_readings: [],
    current_reading: null, status: null, last_delta: null,
    last_comparison: { state: 'insufficient', direction: null, magnitude: null, unit: null },
    last_run: null, sequence: 0,
  };
}

function comparisonFor(rows, current) {
  const previous = rows.filter((row) => row.signal_id === current.signal_id && row.record_date < current.record_date)
    .sort((left, right) => right.record_date.localeCompare(left.record_date))[0];
  if (!previous) return { state: 'insufficient', direction: null, magnitude: null, unit: null };
  if (previous.unit !== current.unit) return { state: 'unit_mismatch', direction: null, magnitude: null, unit: null };
  const difference = current.normalized_value - previous.normalized_value;
  return {
    state: 'comparable', direction: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'unchanged',
    magnitude: Math.abs(difference), unit: current.unit,
  };
}

function applySuccess(inputState, reading, fixture) {
  validateNormalizedReading(reading);
  const state = clone(inputState);
  const index = state.daily_readings.findIndex((row) => row.signal_id === reading.signal_id && row.record_date === reading.record_date);
  const existing = index >= 0 ? state.daily_readings[index] : null;
  const row = {
    record_id: existing?.record_id || `demo-${reading.signal_id}-${reading.record_date}`,
    signal_id: reading.signal_id, record_date: reading.record_date,
    normalized_value: reading.normalized_value, unit: reading.unit,
    first_fetched_at: existing?.first_fetched_at || reading.fetched_at,
    last_fetched_at: reading.fetched_at, reading: clone(reading),
  };
  if (index >= 0) state.daily_readings[index] = row; else state.daily_readings.push(row);
  state.daily_readings.sort((left, right) => left.record_date.localeCompare(right.record_date));
  state.current_reading = clone(reading);
  state.status = { freshness: 'fresh', error_code: 'none' };
  state.last_comparison = comparisonFor(state.daily_readings, row);
  state.last_delta = state.last_comparison.magnitude;
  state.sequence += 1;
  state.last_run = { fixture_id: fixture.fixture_id, virtual_now: fixture.virtual_now, outcome: 'success', error_code: 'none', retry_after_seconds: null };
  return state;
}

function applyError(inputState, errorCode, fixture) {
  const state = clone(inputState);
  state.status = { freshness: 'stale', error_code: errorCode };
  state.sequence += 1;
  state.last_run = {
    fixture_id: fixture.fixture_id, virtual_now: fixture.virtual_now, outcome: 'error', error_code: errorCode,
    retry_after_seconds: fixture.transport.headers['retry-after'] ? Number(fixture.transport.headers['retry-after']) : null,
  };
  return state;
}

export function runFixture(inputState, fixture) {
  if (!fixture || fixture.contract_version !== '1.1.0' || typeof fixture.transport !== 'object') throw new TypeError('unsupported fixture contract');
  if (fixture.transport.mode === 'timeout') return applyError(inputState, 'timeout', fixture);
  if (fixture.transport.mode === 'offline') return applyError(inputState, 'offline', fixture);
  if ([401, 403].includes(fixture.transport.status)) return applyError(inputState, 'auth', fixture);
  if (fixture.transport.status === 429) return applyError(inputState, 'rate_limit', fixture);
  if (fixture.transport.status >= 200 && fixture.transport.status < 300) {
    try { return applySuccess(inputState, fixture.payload, fixture); }
    catch { return applyError(inputState, 'schema_error', fixture); }
  }
  return applyError(inputState, 'schema_error', fixture);
}

export function replayResult(state) {
  return {
    fixture_id: state.last_run?.fixture_id ?? null,
    freshness: state.status?.freshness ?? null,
    error_code: state.status?.error_code ?? null,
    row_count: state.daily_readings.length,
    stored_value: state.current_reading?.normalized_value ?? null,
    delta: state.last_delta,
    record_date: state.current_reading?.record_date ?? null,
    record_id: state.current_reading ? `demo-${state.current_reading.signal_id}-${state.current_reading.record_date}` : null,
  };
}
