import { replayResult, resetReplayState, runFixture } from './replay.mjs';
import normalD1A from './fixtures/normal-d1-a.json' with { type: 'json' };
import normalD1B from './fixtures/normal-d1-b.json' with { type: 'json' };
import normalD2 from './fixtures/normal-d2.json' with { type: 'json' };
import timeout from './fixtures/timeout.json' with { type: 'json' };
import auth401 from './fixtures/auth-401.json' with { type: 'json' };
import rate429 from './fixtures/rate-429.json' with { type: 'json' };
import offline from './fixtures/offline.json' with { type: 'json' };
import schemaBreak from './fixtures/schema-break.json' with { type: 'json' };
import recoverD2 from './fixtures/recover-d2.json' with { type: 'json' };

const FIXTURES = new Map([
  ['T04-NORMAL-D1-A', normalD1A], ['T04-NORMAL-D1-B', normalD1B],
  ['T04-NORMAL-D2', normalD2], ['T04-TIMEOUT', timeout],
  ['T04-AUTH-401', auth401], ['T04-RATE-429', rate429],
  ['T04-OFFLINE', offline], ['T04-SCHEMA-BREAK', schemaBreak],
  ['T04-RECOVER-D2', recoverD2],
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

const loadFixture = (id) => structuredClone(FIXTURES.get(id));

export async function runReplayScenario(name) {
  const sequence = REPLAY_SCENARIOS[name];
  if (!sequence) return null;
  let state = resetReplayState();
  for (const id of sequence) state = runFixture(state, loadFixture(id));
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
