import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { replayResult, resetReplayState, runFixture } from '../replay.mjs';
import { createApp } from '../app.mjs';
import { runReplayScenario } from '../replay-service.mjs';

const names = {
  'T04-NORMAL-D1-A': 'normal-d1-a.json', 'T04-NORMAL-D1-B': 'normal-d1-b.json',
  'T04-NORMAL-D2': 'normal-d2.json', 'T04-TIMEOUT': 'timeout.json',
  'T04-AUTH-401': 'auth-401.json', 'T04-RATE-429': 'rate-429.json',
  'T04-OFFLINE': 'offline.json', 'T04-SCHEMA-BREAK': 'schema-break.json',
  'T04-RECOVER-D2': 'recover-d2.json',
};
const load = async (id) => JSON.parse(await readFile(new URL(`../fixtures/${names[id]}`, import.meta.url), 'utf8'));
const baseline = async () => runFixture(runFixture(resetReplayState(), await load('T04-NORMAL-D1-A')), await load('T04-NORMAL-D1-B'));

test('같은 합성 날짜의 성공은 같은 ID 한 건을 원자적으로 갱신한다', async () => {
  const first = runFixture(resetReplayState(), await load('T04-NORMAL-D1-A'));
  const second = runFixture(first, await load('T04-NORMAL-D1-B'));
  assert.equal(second.daily_readings.length, 1);
  assert.equal(second.daily_readings[0].record_id, first.daily_readings[0].record_id);
  assert.equal(second.daily_readings[0].normalized_value, 105);
});

test('다음 합성 날짜는 새 일별 행과 전일 대비 15를 만든다', async () => {
  const state = runFixture(await baseline(), await load('T04-NORMAL-D2'));
  assert.deepEqual(replayResult(state), {
    fixture_id: 'T04-NORMAL-D2', freshness: 'fresh', error_code: 'none', row_count: 2,
    stored_value: 120, delta: 15, record_date: '2026-08-25', record_id: 'demo-aleph-demo-index-2026-08-25',
  });
});

for (const [id, code] of Object.entries({
  'T04-TIMEOUT': 'timeout', 'T04-AUTH-401': 'auth', 'T04-RATE-429': 'rate_limit',
  'T04-OFFLINE': 'offline', 'T04-SCHEMA-BREAK': 'schema_error',
})) {
  test(`${id}는 마지막 정상값을 보존하고 ${code}를 기록한다`, async () => {
    const before = await baseline();
    const state = runFixture(before, await load(id));
    const result = replayResult(state);
    assert.equal(result.freshness, 'stale');
    assert.equal(result.error_code, code);
    assert.equal(result.row_count, 1);
    assert.equal(result.stored_value, 105);
    assert.equal(result.delta, null);
    assert.deepEqual(state.daily_readings, before.daily_readings);
  });
}

test('실패 뒤 RECOVER-D2 재생은 fresh/none과 다음 날짜 한 건으로 회복한다', async () => {
  let state = runFixture(await baseline(), await load('T04-TIMEOUT'));
  state = runFixture(state, await load('T04-RECOVER-D2'));
  const result = replayResult(state);
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.error_code, 'none');
  assert.equal(result.row_count, 2);
  assert.equal(result.stored_value, 120);
  assert.equal(result.delta, 15);
});

test('합성 reset은 새 메모리 상태만 만들고 환경변수나 외부 저장소를 사용하지 않는다', () => {
  const first = resetReplayState();
  first.daily_readings.push({ marker: true });
  assert.deepEqual(resetReplayState().daily_readings, []);
});

test('무상태 replay API는 운영 저장소와 외부 API 없이 별도 실패 상태를 반환한다', async () => {
  const app = createApp({
    env: {},
    fetchImpl: async () => { throw new Error('외부 API를 호출하면 안 됩니다.'); },
    storageFactory: () => { throw new Error('운영 저장소를 호출하면 안 됩니다.'); },
  });
  const response = await app(new Request('http://localhost/api/replay?scenario=rate_limit'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.synthetic, true);
  assert.deepEqual(data.status, { freshness: 'stale', error_code: 'rate_limit' });
  assert.equal(data.row_count, 1);
  assert.equal(data.stored_value, 105);
  assert.equal(data.retry_available, true);
});

test('회복 API는 요청마다 전체 시퀀스를 다시 계산해 fresh/none을 반환한다', async () => {
  const result = await runReplayScenario('recover');
  assert.deepEqual(result.status, { freshness: 'fresh', error_code: 'none' });
  assert.equal(result.row_count, 2);
  assert.equal(result.stored_value, 120);
  assert.equal(result.delta, 15);
  assert.equal(result.retry_available, false);
  assert.equal(result.records.filter((row) => row.record_date === '2026-08-25').length, 1);
});

test('알 수 없는 replay 시나리오는 400으로 거부한다', async () => {
  const app = createApp();
  const response = await app(new Request('http://localhost/api/replay?scenario=unknown'));
  assert.equal(response.status, 400);
});
