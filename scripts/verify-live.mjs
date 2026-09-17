import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';
import { createStorage } from '../storage.mjs';
import { koreanDate, money } from '../public/format.js';
import { parseRate } from '../rates.mjs';

try {
  const storage = createStorage();
  assert.ok(storage, 'Supabase 연결 설정이 필요합니다.');
  const response = await createApp()(new Request('http://localhost/api/dashboard'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.storage.available, true, data.storage.issue || '저장소에 연결되지 않았습니다.');
  const row = (await storage.snapshot(koreanDate())).records[0];
  assert.ok(row, '검증할 정상 환율 기록이 없습니다.');
  assert.equal(row.persisted, true);
  assert.equal(data.latest.date, row.date);
  assert.equal(parseRate(row.raw.deal_bas_r), row.rate);
  assert.equal(data.latest.rate, row.rate);
  assert.equal(money(data.latest.rate), money(row.rate));
  assert.equal(data.latest.sourcePublishedAt, null);
  assert.equal(row.sourceUrl, data.source.url);
  assert.equal(row.sourceName, data.source.name);
  assert.equal(row.sourceObservedAt, row.fetchedAt);
  assert.equal(row.unit, data.unit);
  console.log(JSON.stringify({
    result: 'PASS', date: row.date, raw: row.raw.deal_bas_r,
    stored: row.rate, display: `${money(data.latest.rate)}원`, unit: data.unit,
    source: row.sourceName, sourceUrl: row.sourceUrl, sourceObservedAt: row.sourceObservedAt,
    sourcePublishedAt: data.latest.sourcePublishedAt, fetchedAt: row.fetchedAt,
    unit: row.unit, queriedAt: data.queriedAt, timeZone: data.timeZone,
    note: 'API 응답 및 Supabase 재조회 검증. 실제 DOM은 브라우저에서 별도 확인합니다.',
  }, null, 2));
} catch (error) {
  console.error(`검증 실패: ${error.message}`);
  process.exitCode = 1;
}
