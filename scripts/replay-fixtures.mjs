import { readFile } from 'node:fs/promises';
import { resetReplayState, replayResult, runFixture } from '../replay.mjs';

const fixtureFiles = new Map([
  ['T04-NORMAL-D1-A', 'normal-d1-a.json'], ['T04-NORMAL-D1-B', 'normal-d1-b.json'],
  ['T04-NORMAL-D2', 'normal-d2.json'], ['T04-TIMEOUT', 'timeout.json'],
  ['T04-AUTH-401', 'auth-401.json'], ['T04-RATE-429', 'rate-429.json'],
  ['T04-OFFLINE', 'offline.json'], ['T04-SCHEMA-BREAK', 'schema-break.json'],
  ['T04-RECOVER-D2', 'recover-d2.json'],
]);
const failureIds = ['T04-TIMEOUT', 'T04-AUTH-401', 'T04-RATE-429', 'T04-OFFLINE', 'T04-SCHEMA-BREAK'];
const load = async (id) => {
  const file = fixtureFiles.get(id);
  if (!file) throw new Error(`알 수 없는 fixture: ${id}`);
  return JSON.parse(await readFile(new URL(`../fixtures/${file}`, import.meta.url), 'utf8'));
};
const verify = (actual, expected) => {
  for (const key of ['freshness', 'error_code', 'row_count', 'stored_value', 'delta']) {
    if (actual[key] !== expected[key]) throw new Error(`${actual.fixture_id}: ${key} 예상 ${expected[key]}, 실제 ${actual[key]}`);
  }
};

const requested = process.argv.slice(2);
const ids = requested.length ? requested : failureIds;
for (const id of ids) {
  let state = resetReplayState();
  for (const baselineId of ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B']) state = runFixture(state, await load(baselineId));
  const fixture = await load(id);
  state = runFixture(state, fixture);
  const result = replayResult(state);
  verify(result, fixture.expected);
  console.log(`${id}: PASS · ${result.freshness}/${result.error_code} · 행 ${result.row_count}건 · 마지막 값 ${result.stored_value}`);
}
