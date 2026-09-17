import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUsd, parseRate, fetchUsd } from '../rates.mjs';
import { koreanDate, shiftDate, compareRates, money } from '../public/format.js';

const usd = { result: 1, cur_unit: 'USD', cur_nm: '미국 달러', deal_bas_r: '1,353.3' };
test('USD 원자료의 숫자를 변경하지 않고 선택한다', () => {
  const row = parseUsd([{ ...usd, cur_unit: 'EUR', cur_nm: '유로' }, usd], '2026-09-16', '2026-09-16T03:01:00Z');
  assert.equal(row.rate, 1353.3);
  assert.equal(row.raw, usd);
  assert.equal(row.sourcePublishedAt, null);
  assert.equal(money(row.rate), '1,353.30');
  assert.equal(parseUsd([{ ...usd, cur_nm: '미국달러' }], '2026-09-16', '2026-09-16T03:01:00Z').rate, 1353.3);
});
test('빈 응답은 데이터 없음, 잘못된 데이터는 오류로 구분한다', () => {
  assert.equal(parseUsd([], '2026-09-16', ''), null);
  for (const payload of [{}, null, [{ ...usd, cur_unit: 'EUR' }], [usd, usd]]) assert.throws(() => parseUsd(payload, '2026-09-16', ''), { code: 'invalid_data' });
  assert.throws(() => parseUsd([{ result: 3 }], '2026-09-16', ''), { code: 'auth_error' });
  assert.throws(() => parseUsd([{ result: 4 }], '2026-09-16', ''), { code: 'quota_exceeded' });
});
test('환율에 0, 음수, 무한대, 오염된 숫자를 허용하지 않는다', () => {
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1,35.3', '1353.300', '', '1353원', null, 1353]) assert.throws(() => parseRate(value));
  assert.equal(parseRate('1,353.30'), 1353.3);
});
test('UTC가 아닌 한국 자정과 윤년 기준으로 날짜를 계산한다', () => {
  assert.equal(koreanDate(new Date('2026-09-15T14:59:59Z')), '2026-09-15');
  assert.equal(koreanDate(new Date('2026-09-15T15:00:00Z')), '2026-09-16');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
});
test('전일 대비 계산은 소수 오차 및 데이터 부재를 처리한다', () => {
  assert.equal(compareRates({ rate: 1353.3 }, { rate: 1353.2 }).difference, .1);
  assert.equal(compareRates({ rate: 1353.3 }, null), null);
  assert.equal(compareRates({ rate: 100 }, { rate: 0 }), null);
});
test('한국수출입은행 AP01 및 yyyymmdd를 사용한다', async () => {
  const row = await fetchUsd('2026-09-16', { apiKey: 'test-key', fetchImpl: async (url) => {
    assert.equal(url.origin, 'https://oapi.koreaexim.go.kr');
    assert.equal(url.searchParams.get('data'), 'AP01');
    assert.equal(url.searchParams.get('searchdate'), '20260916');
    assert.equal(url.searchParams.get('authkey'), 'test-key');
    return Response.json([usd]);
  } });
  assert.equal(row.rate, 1353.3);
});
test('오류 메시지에 인증키나 요청 URL을 노출하지 않는다', async () => {
  await assert.rejects(fetchUsd('2026-09-16', { apiKey: 'sensitive-key', fetchImpl: async (url) => { throw new Error(String(url)); } }), (error) => error.code === 'network_error' && !error.message.includes('sensitive-key'));
  await assert.rejects(fetchUsd('2026-09-16', { apiKey: '' }), { code: 'configuration_error' });
  await assert.rejects(fetchUsd('2026-09-16', { apiKey: 'key', fetchImpl: async () => new Response('unavailable', { status: 503 }) }), { code: 'upstream_error' });
  await assert.rejects(fetchUsd('2026-09-16', { apiKey: 'key', fetchImpl: async () => new Response('<html>blocked</html>') }), { code: 'invalid_data' });
});
