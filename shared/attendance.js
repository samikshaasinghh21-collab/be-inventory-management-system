import { monthKey } from './payroll.js';

export function attendanceDates(month) {
  const key = monthKey(month);
  return attendanceStatuses([], key).map((_, index) =>
    `${key}-${String(index + 1).padStart(2, '0')}`
  );
}

export function formatAttendanceDate(date) {
  return date.split('-').reverse().join('/');
}

export function attendanceStatuses(values, month, legacyHolidays = false) {
  const key = monthKey(month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) throw new Error('Select a valid attendance month.');
  const [year, number] = key.split('-').map(Number);
  const days = new Date(year, number, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const value = Array.isArray(values) ? values[i] : values?.[String(i + 1)];
    const status = String(value || 'P').toUpperCase();
    return legacyHolidays && status === 'H' ? 'O' : ['P', 'A', 'L', 'H', 'O'].includes(status) ? status : 'P';
  });
}

export function attendanceTotals(statuses) {
  const counts = statuses.reduce((result, status) => { result[status] = (result[status] || 0) + 1; return result; }, { P: 0, A: 0, L: 0, H: 0, O: 0 });
  // Holidays are paid days in the payroll denominator, but are not days actually worked.
  return { ...counts, total: statuses.length, worked: counts.P + counts.H / 2, unpaid: counts.A + counts.H / 2, paid: statuses.length - counts.A - counts.H / 2, working: statuses.length };
}
