import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';
import { parseUsd, RateError } from '../rates.mjs';
const now = () => new Date('2026-09-16T03:30:00Z');
const raw = { result: 1, cur_unit: 'USD', cur_nm: '미국 달러', deal_bas_r: '1,353.3' };
const record = (date, rate = '1,353.3') => ({ ...parseUsd([{ ...raw, deal_bas_r: rate }], date, now().toISOString()), persisted: true });
const get = (handler, path = '/api/dashboard', options) => handler(new Request(`http://localhost${path}`, options));

function fakeStorage(records = [], attempt = null) {
  return {
    records, attempt, claims: 0, finishes: 0,
    async snapshot() { return { records: this.records, attempt: this.attempt }; },
    async claim() {
      this.claims++;
      if (this.records.some((r) => r.date === '2026-09-16') || this.attempt?.status === 'pending') return null;
      this.attempt = { rate_date: '2026-09-16', status: 'pending', started_at: now().toISOString() };
      return 'token';
    },
    async finish(date, token, row, error) {
      this.finishes++;
      if (row) this.records.unshift({ ...row, persisted: true });
      this.attempt = { ...this.attempt, status: error ? 'error' : row ? 'success' : 'no_data', finished_at: now().toISOString(), error_code: error?.code };
      return true;
    },
  };
}

test('정상 한 건을 저장 후 재조회하여 원자료/저장값/API값을 일치시킨다', async () => {
  const storage = fakeStorage([record('2026-09-15', '1,350.1')]);
  let calls = 0;
  const app = createApp({ env: { api_key: 'test' }, now, storageFactory: () => storage, fetchImpl: async () => { calls++; return Response.json([raw]); } });
  const data = await (await get(app)).json();
  assert.equal(data.latest.persisted, true);
  assert.equal(data.latest.raw.deal_bas_r, '1,353.3');
  assert.equal(data.latest.rate, 1353.3);
  assert.equal(data.comparison.difference, 3.2);
  await get(app);
  assert.equal(calls, 1);
  assert.equal(storage.finishes, 1);
});
test('오늘 빈 응답이면 이전 기록 유지, 비교 불가, no_data 기록', async () => {
  const storage = fakeStorage([record('2026-09-15')]);
  const app = createApp({ env: { api_key: 'test' }, now, storageFactory: () => storage, fetchImpl: async () => Response.json([]) });
  const data = await (await get(app)).json();
  assert.equal(data.latest.date, '2026-09-15');
  assert.equal(data.comparison, null);
  assert.equal(data.attempt.status, 'no_data');
  assert.equal(storage.records.length, 1);
});
test('어제가 아닌 최근 영업일을 어제로 둔갑시키지 않는다', async () => {
  const storage = fakeStorage([record('2026-09-16'), record('2026-09-14')]);
  const app = createApp({ now, storageFactory: () => storage });
  const data = await (await get(app)).json();
  assert.equal(data.comparison, null);
  assert.equal(storage.claims, 0);
});
test('API 실패를 데이터 없음과 구분하고 정상 과거값은 보존한다', async () => {
  const storage = fakeStorage([record('2026-09-15')]);
  const app = createApp({ now, env: { api_key: 'test' }, storageFactory: () => storage, fetchImpl: async () => { throw new Error('offline'); } });
  const data = await (await get(app)).json();
  assert.equal(data.attempt.status, 'error');
  assert.equal(data.attempt.error_code, 'network_error');
  assert.ok(data.issue);
  assert.equal(data.latest.date, '2026-09-15');
});

test('동시 첫 조회에도 외부 API 수집은 한 번만 수행한다', async () => {
  const storage = fakeStorage();
  let calls = 0;
  const app = createApp({ now, env: { api_key: 'test' }, storageFactory: () => storage, fetchImpl: async () => { calls++; return Response.json([raw]); } });
  await Promise.all([get(app), get(app), get(app)]);
  assert.equal(calls, 1);
  assert.equal(storage.records.length, 1);
});
test('Supabase 미설정이면 실조회값을 저장됐다고 표시하지 않는다', async () => {
  let calls = 0;
  const app = createApp({ now, env: { api_key: 'test' }, storageFactory: () => null, fetchImpl: async () => { calls++; return Response.json([raw]); } });
  const data = await (await get(app)).json();
  assert.equal(data.storage.configured, false);
  assert.equal(data.latest.persisted, false);
  assert.equal(data.comparison.difference, 0);
  await get(app);
  assert.equal(calls, 2);
});
test('DB 조회 실패도 저장 성공으로 표시하지 않는다', async () => {
  const app = createApp({ now, env: { api_key: 'test' }, storageFactory: () => ({ snapshot() { throw new RateError('storage_error', '저장소 연결 실패'); } }), fetchImpl: async () => Response.json([raw]) });
  const data = await (await get(app)).json();
  assert.equal(data.storage.available, false);
  assert.equal(data.latest.persisted, false);
  assert.equal(data.issue, '저장소 연결 실패');
});
test('DB 쓰기 실패시 기존 저장값과 저장 실패 상태를 유지한다', async () => {
  const storage = fakeStorage([record('2026-09-15')]);
  storage.finish = async () => { throw new RateError('storage_error', '저장 실패'); };
  const app = createApp({ now, env: { api_key: 'test' }, storageFactory: () => storage, fetchImpl: async () => Response.json([raw]) });
  const data = await (await get(app)).json();
  assert.equal(data.storage.available, false);
  assert.equal(data.latest.date, '2026-09-15');
  assert.equal(data.comparison, null);
});
test('최근 10분 이내 실패와 진행중 수집은 다시 호출하지 않는다', async () => {
  for (const status of ['error', 'no_data', 'pending']) {
    const storage = fakeStorage([], { status, started_at: now().toISOString() });
    const app = createApp({ now, storageFactory: () => storage });
    await get(app);
    assert.equal(storage.claims, 0);
  }
});
test('Cron은 인증을 요구하며 공개 API는 올바른 메서드만 허용한다', async () => {
  const storage = fakeStorage([record('2026-09-16')]);
  const app = createApp({ now, env: { CRON_SECRET: 'safe-test-key' }, storageFactory: () => storage });
  assert.equal((await get(app, '/api/collect')).status, 401);
  assert.equal((await get(app, '/api/collect', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await get(app, '/api/collect', { headers: { authorization: 'Bearer safe-test-key' } })).status, 200);
  assert.equal((await get(app, '/api/dashboard', { method: 'POST' })).status, 405);
  assert.equal((await get(app, '/api/not-found')).status, 404);
  const noSecret = createApp({ now, env: {}, storageFactory: () => storage });
  assert.equal((await get(noSecret, '/api/collect', { headers: { authorization: 'Bearer undefined' } })).status, 401);
});
