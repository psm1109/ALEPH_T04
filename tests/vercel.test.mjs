import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/[action].js';
import { readFile } from 'node:fs/promises';

test('Vercel 어댑터가 Node 응답 객체로 상태와 JSON을 전달한다', async () => {
  const headers = {};
  let body;
  const res = { statusCode: 0, setHeader(name, value) { headers[name] = value; }, end(value) { body = value; } };
  await handler({ url: '/api/dashboard', method: 'POST', headers: { host: 'test.local' } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(headers.allow, 'GET');
  assert.equal(headers['cache-control'], 'no-store');
  assert.ok(JSON.parse(body).error);
});
test('배포 설정은 정적 파일과 API를 분리하고 정오 KST에 Cron을 실행한다', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.buildCommand, '');
  assert.equal(config.crons[0].path, '/api/collect');
  assert.equal(config.crons[0].schedule, '0 3 * * *');
});
