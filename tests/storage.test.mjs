import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../storage.mjs';

const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const raw = { result: 1, cur_nm: '미국 달러', cur_unit: 'USD', deal_bas_r: '1,353.3' };
const storedRow = {
  rate_date: '2026-09-16', raw_response: raw, rate: 1353.3,
  fetched_at: '2026-09-16T03:00:00Z', source_observed_at: '2026-09-16T03:00:00Z', source_published_at: null,
  source_name: '한국수출입은행', source_url: 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON', unit: '원 / 1 USD',
};

test('Supabase Secret key는 서버의 apikey 헤더로만 전송한다', async () => {
  const storage = createStorage(env, async (url, options) => {
    assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(!url.includes(env.SUPABASE_SECRET_KEY));
    return Response.json(url.includes('exchange_rates?') ? [storedRow] : []);
  });
  const snapshot = await storage.snapshot('2026-09-16');
  assert.equal(snapshot.records[0].persisted, true);
  assert.equal(snapshot.records[0].rate, 1353.3);
  assert.equal(snapshot.records[0].sourceUrl, storedRow.source_url);
  assert.equal(snapshot.records[0].sourceObservedAt, storedRow.source_observed_at);
  assert.equal(snapshot.records[0].unit, storedRow.unit);
});
test('DB 저장값과 원자료가 다르면 화면으로 전달하지 않는다', async () => {
  const storage = createStorage(env, async (url) => Response.json(url.includes('exchange_rates?') ? [{ ...storedRow, rate: 999 }] : []));
  await assert.rejects(storage.snapshot('2026-09-16'), { code: 'storage_error' });
});
test('Supabase 오류 응답에 포함된 내용을 외부로 유출하지 않는다', async () => {
  const storage = createStorage(env, async () => Response.json({ message: 'sb_secret_test' }, { status: 401 }));
  await assert.rejects(storage.snapshot('2026-09-16'), (error) => error.code === 'storage_error' && !error.message.includes('sb_secret_test'));
});
test('수집 완료 RPC는 원자료와 실제 API 수신 시각을 함께 저장한다', async () => {
  const storage = createStorage(env, async (url, options) => {
    assert.ok(url.endsWith('/rpc/finish_exchange_fetch'));
    assert.deepEqual(JSON.parse(options.body), {
      p_date: '2026-09-16', p_token: 'test-token', p_status: 'success', p_raw: raw,
      p_fetched_at: '2026-09-16T03:00:00Z', p_error_code: null,
    });
    return Response.json(true);
  });
  assert.equal(await storage.finish('2026-09-16', 'test-token', { raw, fetchedAt: '2026-09-16T03:00:00Z' }), true);
});
test('과거 적재는 기존 날짜를 덮어쓰지 않는다', async () => {
  const storage = createStorage(env, async (url, options) => {
    assert.ok(url.endsWith('/exchange_rates?on_conflict=rate_date'));
    assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
    assert.deepEqual(JSON.parse(options.body), {
      rate_date: '2026-09-15', raw_response: raw, fetched_at: '2026-09-16T03:00:00Z',
      source_observed_at: '2026-09-16T03:00:00Z', source_name: '한국수출입은행',
      source_url: 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON', unit: '원 / 1 USD',
    });
    return Response.json([]);
  });
  assert.equal(await storage.importHistory({
    date: '2026-09-15', raw, fetchedAt: '2026-09-16T03:00:00Z', sourceObservedAt: '2026-09-16T03:00:00Z',
    sourceName: '한국수출입은행', sourceUrl: 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON', unit: '원 / 1 USD',
  }), false);
});

test('출처 URL·관측 시각·단위가 원천 메타데이터와 다르면 표시하지 않는다', async () => {
  for (const changed of [
    { source_url: 'https://example.com' }, { source_observed_at: '2026-09-16T04:00:00Z' }, { unit: 'USD' },
  ]) {
    const storage = createStorage(env, async (url) => Response.json(url.includes('exchange_rates?') ? [{ ...storedRow, ...changed }] : []));
    await assert.rejects(storage.snapshot('2026-09-16'), { code: 'storage_error' });
  }
});
