import { createStorage } from '../storage.mjs';
import { fetchUsd } from '../rates.mjs';
import { koreanDate, shiftDate } from '../public/format.js';

// 초기 화면에서 실제 전일 비교/차트를 볼 수 있도록 과거 원자료를 적재합니다.
// 예시값을 생성하지 않으며 빈 응답 날짜와 기존 DB 행은 그대로 둡니다.
const days = Number(process.argv.find((arg) => arg.startsWith('--days='))?.split('=')[1] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 30) {
  console.error('--days는 1~30 사이 정수여야 합니다.');
  process.exitCode = 1;
} else {
  try {
    const storage = createStorage();
    if (!storage) throw new Error('Supabase 환경변수를 설정해 주세요.');
    const today = koreanDate();
    const existing = new Set((await storage.snapshot(today)).records.map((r) => r.date));
    for (let index = days - 1; index >= 0; index--) {
      const date = shiftDate(today, -index);
      if (existing.has(date)) { console.log(`${date}: 기존 기록 유지`); continue; }
      const record = await fetchUsd(date);
      if (!record) { console.log(`${date}: 출처 데이터 없음, 환율 저장 안 함`); continue; }
      const inserted = await storage.importHistory(record);
      console.log(`${date}: ${inserted ? '실제 원자료 저장 완료' : '기존 기록 유지'}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
