export const TIME_ZONE = 'Asia/Seoul';
export const money = (value) => new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

export function koreanDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function timestamp(value) {
  if (!value) return '아직 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

export function compareRates(current, previous) {
  if (!current || !previous || previous.rate <= 0) return null;
  const difference = (Math.round(current.rate * 100) - Math.round(previous.rate * 100)) / 100;
  return { difference, percent: difference / previous.rate * 100 };
}
