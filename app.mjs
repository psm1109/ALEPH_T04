import { timingSafeEqual } from 'node:crypto';
import { fetchUsd, RateError, SOURCE_NAME, SOURCE_URL } from './rates.mjs';
import { createStorage } from './storage.mjs';
import { koreanDate, shiftDate, compareRates, TIME_ZONE } from './public/format.js';
import { runReplayScenario } from './replay-service.mjs';

const ERROR_TEXT = {
  auth_error: '출처 API 인증에 실패했어요.', quota_exceeded: '출처 API의 일일 조회 한도에 도달했어요.',
  upstream_error: '출처 API에서 정상 응답을 받지 못했어요.', invalid_data: '출처 데이터 형식을 확인할 수 없어요.',
  timeout: '출처 API 응답 대기 시간이 초과됐어요.', network_error: '출처 API에 연결하지 못했어요.',
  configuration_error: '한국수출입은행 API 인증키가 설정되지 않았어요.',
};

const STANDARD_ERROR = Object.freeze({
  timeout: 'timeout', auth_error: 'auth', quota_exceeded: 'rate_limit',
  network_error: 'offline', invalid_data: 'schema_error',
});

export function createApp({ env = process.env, fetchImpl = fetch, now = () => new Date(), storageFactory = createStorage } = {}) {
  let liveCache;
  let livePending;
  const loadRate = (date) => fetchUsd(date, { apiKey: env.api_key, fetchImpl, now });

  async function collect(storage, date) {
    const token = await storage.claim(date);
    if (!token) return false;
    let record = null;
    let error = null;
    try { record = await loadRate(date); } catch (cause) { error = cause; }
    const finished = await storage.finish(date, token, record, error);
    if (!finished) throw new RateError('storage_error', '수집한 데이터의 저장 완료를 확인하지 못했어요.');
    return true;
  }

  async function live(today) {
    if (liveCache?.today === today && now().getTime() - liveCache.at < 600000) return liveCache.value;
    if (livePending?.today === today) return livePending.promise;
    const promise = (async () => {
      const started = now().toISOString();
      const results = await Promise.allSettled([loadRate(today), loadRate(shiftDate(today, -1))]);
      const records = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
      const current = results[0];
      const value = { records, attempt: {
        rate_date: today, started_at: started, finished_at: now().toISOString(),
        status: current.status === 'rejected' ? 'error' : current.value ? 'success' : 'no_data',
        error_code: current.status === 'rejected' ? current.reason.code : null,
      }, previousError: results[1].status === 'rejected' ? results[1].reason.message : null };
      liveCache = { today, at: now().getTime(), value };
      return value;
    })();
    livePending = { today, promise };
    try { return await promise; } finally { livePending = null; }
  }

  async function dashboard() {
    const today = koreanDate(now());
    let storage;
    let storageIssue = null;
    let snapshot;
    try {
      storage = storageFactory(env, fetchImpl);
      if (storage) {
        snapshot = await storage.snapshot(today);
        if (!snapshot.records.some((record) => record.date === today)) {
          const attempt = snapshot.attempt;
          const canRetry = !attempt || now().getTime() - new Date(attempt.started_at).getTime() >= 600000;
          if (canRetry) {
            await collect(storage, today);
            snapshot = await storage.snapshot(today);
          }
        }
      }
    } catch (error) {
      storageIssue = error instanceof RateError ? error.message : '저장 상태를 확인하지 못했어요.';
    }
    if (!snapshot) snapshot = await live(today);
    const latest = snapshot.records[0] ?? null;
    const current = snapshot.records.find((row) => row.date === today);
    const previous = snapshot.records.find((row) => row.date === shiftDate(today, -1));
    const attempt = snapshot.attempt;
    const issue = storageIssue || (attempt?.status === 'error' ? ERROR_TEXT[attempt.error_code] || '오늘 데이터를 수집하지 못했어요.' : null);
    const standardError = attempt?.status === 'error' ? STANDARD_ERROR[attempt.error_code] || null : null;
    return {
      today, yesterday: shiftDate(today, -1), queriedAt: now().toISOString(),
      source: { name: SOURCE_NAME, url: SOURCE_URL }, timeZone: TIME_ZONE, unit: '원 / 1 USD',
      latest, records: snapshot.records, comparison: compareRates(current, previous),
      attempt, issue, previousError: snapshot.previousError ?? null,
      status: {
        freshness: current ? 'fresh' : latest ? 'stale' : 'unavailable',
        error_code: current ? 'none' : standardError,
      },
      storage: { configured: Boolean(storage), available: Boolean(storage) && !storageIssue, issue: storageIssue },
    };
  }

  return async function handle(request) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    const url = new URL(request.url);
    if (!['/api/dashboard', '/api/collect', '/api/replay'].includes(url.pathname)) return respond({ error: '요청한 API가 없어요.' }, 404);
    if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'GET 요청만 지원해요.' }), { status: 405, headers: { ...headers, Allow: 'GET' } });
    try {
      if (url.pathname === '/api/replay') {
        const scenario = url.searchParams.get('scenario') || 'baseline';
        const result = await runReplayScenario(scenario);
        return result ? respond(result) : respond({ error: '지원하지 않는 합성 재생 시나리오예요.' }, 400);
      }
      if (url.pathname === '/api/dashboard') return respond(await dashboard());
      const secret = env.CRON_SECRET;
      const received = Buffer.from(request.headers.get('authorization') || '');
      const expected = Buffer.from(`Bearer ${secret || ''}`);
      if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return respond({ error: '인증이 필요해요.' }, 401);
      const storage = storageFactory(env, fetchImpl);
      if (!storage) return respond({ error: 'Supabase 연결 설정이 필요해요.' }, 503);
      const today = koreanDate(now());
      const claimed = await collect(storage, today);
      const snapshot = await storage.snapshot(today);
      const status = snapshot.records.some((r) => r.date === today) ? 'success' : snapshot.attempt?.status || 'pending';
      return respond({ date: today, status, claimed }, status === 'error' ? 502 : 200);
    } catch (error) {
      return respond({ error: error instanceof RateError ? error.message : '일시적인 오류로 요청을 완료하지 못했어요.' }, 503);
    }
  };
}
