import { readFile } from 'node:fs/promises';
import { replayResult, resetReplayState, runFixture } from './replay.mjs';

const FILES = new Map([
  ['T04-NORMAL-D1-A', new URL('./fixtures/normal-d1-a.json', import.meta.url)],
  ['T04-NORMAL-D1-B', new URL('./fixtures/normal-d1-b.json', import.meta.url)],
  ['T04-NORMAL-D2', new URL('./fixtures/normal-d2.json', import.meta.url)],
  ['T04-TIMEOUT', new URL('./fixtures/timeout.json', import.meta.url)],
  ['T04-AUTH-401', new URL('./fixtures/auth-401.json', import.meta.url)],
  ['T04-RATE-429', new URL('./fixtures/rate-429.json', import.meta.url)],
  ['T04-OFFLINE', new URL('./fixtures/offline.json', import.meta.url)],
  ['T04-SCHEMA-BREAK', new URL('./fixtures/schema-break.json', import.meta.url)],
  ['T04-RECOVER-D2', new URL('./fixtures/recover-d2.json', import.meta.url)],
]);

export const REPLAY_SCENARIOS = Object.freeze({
  baseline: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B'],
  normal: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-NORMAL-D2'],
  timeout: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-TIMEOUT'],
  auth: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-AUTH-401'],
  rate_limit: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-RATE-429'],
  offline: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-OFFLINE'],
  schema_error: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-SCHEMA-BREAK'],
  recover: ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-TIMEOUT', 'T04-RECOVER-D2'],
});

const loadFixture = async (id) => JSON.parse(await readFile(FILES.get(id), 'utf8'));

export async function runReplayScenario(name) {
  const sequence = REPLAY_SCENARIOS[name];
  if (!sequence) return null;
  let state = resetReplayState();
  for (const id of sequence) state = runFixture(state, await loadFixture(id));
  const result = replayResult(state);
  return {
    synthetic: true,
    scenario: name,
    sequence,
    fixture_id: result.fixture_id,
    status: { freshness: result.freshness, error_code: result.error_code },
    row_count: result.row_count,
    stored_value: result.stored_value,
    delta: result.delta,
    record_date: result.record_date,
    retry_available: result.freshness === 'stale',
    records: state.daily_readings.map((row) => ({
      record_id: row.record_id,
      signal_id: row.signal_id,
      record_date: row.record_date,
      normalized_value: row.normalized_value,
      unit: row.unit,
      source_name: row.reading.source_name,
      source_url: row.reading.source_url,
      source_time: row.reading.source_time,
      fetched_at: row.reading.fetched_at,
    })),
    last_run: state.last_run,
  };
}
