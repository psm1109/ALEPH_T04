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
  assert.deepEqual(config.rewrites[0], { source: '/replay', destination: '/replay.html' });
});

test('공개 장애 재생 화면은 실패 선택과 다시 시도 동작을 제공한다', async () => {
  const html = await readFile(new URL('../public/replay.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../public/replay-ui.js', import.meta.url), 'utf8');
  for (const scenario of ['timeout', 'auth', 'rate_limit', 'offline', 'schema_error']) assert.match(html, new RegExp(`data-scenario="${scenario}"`));
  assert.match(html, /id="retry"/);
  assert.match(script, /run\('recover'\)/);
  assert.match(script, /\/api\/replay\?scenario=/);
});
