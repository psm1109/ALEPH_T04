import { koreanDate } from './public/format.js';

export const SOURCE_URL = 'https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';
export const SOURCE_NAME = '한국수출입은행';
export const SOURCE_UNIT = '원 / 1 USD';

export class RateError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function parseRate(value) {
  if (typeof value !== 'string' || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new RateError('invalid_data', '환율 응답의 숫자 형식을 확인할 수 없어요.');
  }
  const rate = Number(value.replaceAll(',', ''));
  if (!Number.isFinite(rate) || rate <= 0 || rate > 99999999) {
    throw new RateError('invalid_data', '유효한 기준환율이 아니어서 표시하지 않았어요.');
  }
  return rate;
}

export function parseUsd(payload, date, fetchedAt) {
  if (!Array.isArray(payload)) throw new RateError('invalid_data', '예상한 환율 응답 형식이 아니에요.');
  if (payload.length === 0) return null;
  const failure = payload.find((row) => Number(row?.result) !== 1);
  if (failure) {
    const code = Number(failure.result);
    throw new RateError(code === 3 ? 'auth_error' : code === 4 ? 'quota_exceeded' : 'upstream_error',
      code === 3 ? '출처 API 인증에 실패했어요.' : code === 4 ? '출처 API의 일일 조회 한도에 도달했어요.' : '출처 API에서 정상 데이터를 받지 못했어요.');
  }
  const matches = payload.filter((row) => row.cur_nm?.replace(/\s/g, '') === '미국달러' && row.cur_unit === 'USD');
  if (matches.length !== 1) throw new RateError('invalid_data', '미국 달러 항목을 정확히 한 건 확인할 수 없어요.');
  const raw = matches[0];
  return {
    date, rate: parseRate(raw.deal_bas_r), currency: 'USD', fetchedAt,
    sourceObservedAt: fetchedAt, sourcePublishedAt: null,
    sourceName: SOURCE_NAME, sourceUrl: SOURCE_URL, unit: SOURCE_UNIT,
    raw, persisted: false,
  };
}

export async function fetchUsd(date = koreanDate(), { apiKey = process.env.api_key, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!apiKey?.trim()) throw new RateError('configuration_error', '한국수출입은행 API 인증키가 설정되지 않았어요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new RateError('invalid_date', '조회 날짜가 올바르지 않아요.');
  }
  const url = new URL(SOURCE_URL);
  url.search = new URLSearchParams({ authkey: apiKey, searchdate: date.replaceAll('-', ''), data: 'AP01' });
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new RateError('upstream_error', `출처 API가 HTTP ${response.status}로 응답했어요.`);
    let payload;
    try { payload = await response.json(); }
    catch { throw new RateError('invalid_data', '출처에서 JSON 데이터를 받지 못했어요.'); }
    return parseUsd(payload, date, now().toISOString());
  } catch (error) {
    if (error instanceof RateError) throw error;
    throw new RateError(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'network_error',
      error.name === 'TimeoutError' || error.name === 'AbortError' ? '출처 API 응답 대기 시간이 초과됐어요.' : '출처 API에 연결하지 못했어요.');
  }
}
