import { RateError, parseRate, SOURCE_NAME, SOURCE_URL, SOURCE_UNIT } from './rates.mjs';

export function createStorage(env = process.env, fetchImpl = fetch) {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new RateError('storage_error', 'Supabase URL 설정을 확인해 주세요.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/') {
    throw new RateError('storage_error', 'Supabase HTTPS 프로젝트 URL을 확인해 주세요.');
  }
  async function request(path, body, extraHeaders = {}) {
    try {
      const headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders };
      // Secret keys use apikey; legacy service_role JWTs also use Authorization.
      if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
      const response = await fetchImpl(`${url}/rest/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(7000), cache: 'no-store',
      });
      if (!response.ok) throw new Error('storage');
      return await response.json();
    } catch {
      throw new RateError('storage_error', '저장소에 연결하지 못했어요. 연결 정보와 SQL 적용 상태를 확인해 주세요.');
    }
  }
  return {
    // 관리자 CLI에서만 사용. 실제 과거 응답을 최초 적재하고 기존 기록은 보존합니다.
    async importHistory(record) {
      const rows = await request('exchange_rates?on_conflict=rate_date', {
        rate_date: record.date, raw_response: record.raw, fetched_at: record.fetchedAt,
        source_observed_at: record.sourceObservedAt, source_name: record.sourceName,
        source_url: record.sourceUrl, unit: record.unit,
      }, { Prefer: 'resolution=ignore-duplicates,return=representation' });
      return rows.length > 0;
    },
    async snapshot(today) {
      const [rows, runs] = await Promise.all([
        request(`exchange_rates?select=*&rate_date=lte.${today}&order=rate_date.desc&limit=60`),
        request(`exchange_fetch_runs?select=rate_date,status,started_at,finished_at,error_code&rate_date=eq.${today}&limit=1`),
      ]);
      const records = rows.map((row) => {
        const rate = Number(row.rate);
        if (rate !== parseRate(row.raw_response?.deal_bas_r) || row.raw_response?.cur_unit !== 'USD'
          || row.source_name !== SOURCE_NAME || row.source_url !== SOURCE_URL || row.unit !== SOURCE_UNIT
          || new Date(row.source_observed_at).getTime() !== new Date(row.fetched_at).getTime()) {
          throw new RateError('storage_error', '저장된 환율과 원자료가 일치하지 않아 표시하지 않았어요.');
        }
        return {
          date: row.rate_date, rate, currency: 'USD', fetchedAt: row.fetched_at,
          sourceObservedAt: row.source_observed_at, sourcePublishedAt: row.source_published_at,
          sourceName: row.source_name, sourceUrl: row.source_url, unit: row.unit,
          raw: row.raw_response, persisted: true,
        };
      });
      return { records, attempt: runs[0] ?? null };
    },
    claim(date) { return request('rpc/claim_exchange_fetch', { p_date: date }); },
    finish(date, token, record, error = null) {
      return request('rpc/finish_exchange_fetch', {
        p_date: date, p_token: token, p_status: error ? 'error' : record ? 'success' : 'no_data',
        p_raw: record?.raw ?? null, p_fetched_at: record?.fetchedAt ?? null, p_error_code: error?.code ?? null,
      });
    },
  };
}
