import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { attendanceDates, attendanceStatuses, attendanceTotals, formatAttendanceDate } from '../../shared/attendance.js';
import { attendanceWorkbook } from '../../src/utils/attendanceExport.js';
import { calculateLop } from '../../shared/payroll.js';

test('calendar totals exclude extra days and handle leap years', () => {
  for (const [month, days] of [['2026-02',28], ['2024-02',29], ['2026-04',30], ['2026-01',31]]) {
    const statuses = attendanceStatuses(Array(31).fill('P'), month);
    assert.equal(attendanceTotals(statuses).total, days);
    assert.equal(attendanceTotals(statuses).P, days);
  }
});
test('half days contribute half a worked and unpaid day; old holidays remain holidays', () => {
  const legacy = attendanceStatuses(['H','A','L'], '2026-02', true);
  assert.equal(legacy[0], 'O');
  const totals = attendanceTotals(attendanceStatuses(['H','A','L','O'], '2026-02'));
  assert.equal(totals.H, 1); assert.equal(totals.O, 1);
  assert.equal(totals.worked, 24.5); assert.equal(totals.unpaid, 1.5);
  assert.equal(totals.working, 28);
  assert.equal(calculateLop(28000, totals.working, totals.unpaid), 1500);
});

test('holidays are paid working days and never add LOP', () => {
  for (const holidayCount of [0, 4, 30]) {
    const statuses = attendanceStatuses(Array(holidayCount).fill('O'), '2026-04');
    const totals = attendanceTotals(statuses);
    assert.equal(totals.working, 30);
    assert.equal(totals.unpaid, 0);
    assert.equal(calculateLop(30000, totals.working, totals.unpaid), 0);
  }
  const totals = attendanceTotals(attendanceStatuses(['O', 'O', 'A', 'H'], '2026-04'));
  assert.equal(totals.working, 30);
  assert.equal(totals.unpaid, 1.5);
  assert.equal(calculateLop(30000, totals.working, totals.unpaid), 1500);
});
test('Excel round-trip preserves every employee, day and numeric totals', () => {
  const workbook = attendanceWorkbook([{employeeId:'001', employeeName:'Employee One', statuses:['H','A','L','O']}, {employeeId:'002', employeeName:'Employee Two', statuses:[]}], '2026-02');
  const bytes = XLSX.write(workbook, {type:'buffer', bookType:'xlsx'});
  const read = XLSX.read(bytes, {type:'buffer'});
  const rows = XLSX.utils.sheet_to_json(read.Sheets['Attendance Register'], {header:1});
  assert.equal(rows.length, 3); assert.equal(rows[1][0], '001');
  assert.deepEqual(rows[1].slice(3,8), [0.5,0,0,0,1]);
  assert.equal(read.Sheets['Attendance Register'].D2.t, 'n');
  assert.equal(read.Sheets['Attendance Register'].D1.t, 'n');
  assert.equal(XLSX.utils.format_cell(read.Sheets['Attendance Register'].D1), '01/02/2026');
  assert.equal(XLSX.utils.format_cell(read.Sheets['Attendance Register'].AE1), '28/02/2026');
  assert.equal(rows[1].slice(3,31).reduce((sum, value) => sum + value, 0), rows[1].at(-3));
  assert.deepEqual(rows[1].slice(-9), [24,1,1,1,1,28,24.5,1.5,26.5]);
  assert.deepEqual(rows[2].slice(-9), [28,0,0,0,0,28,28,0,28]);
});

test('attendance dates include full calendar dates through the last day of the month', () => {
  for (const [month, lastDay] of [['2026-02', '28'], ['2024-02', '29'], ['2026-04', '30'], ['2026-12', '31']]) {
    const dates = attendanceDates(month);
    assert.equal(dates[0], `${month}-01`);
    assert.equal(dates.at(-1), `${month}-${lastDay}`);
    assert.equal(dates.length, Number(lastDay));
    assert.equal(formatAttendanceDate(dates[0]), `01/${month.slice(5)}/${month.slice(0,4)}`);
  }
});


test('only absences and half days reduce paid salary days', () => {
  for (const [status, paid, unpaid] of [['P',30,0], ['L',30,0], ['O',30,0], ['A',29,1], ['H',29.5,0.5]]) {
    const totals = attendanceTotals(attendanceStatuses([status], '2026-11'));
    assert.equal(totals.paid, paid);
    assert.equal(totals.unpaid, unpaid);
    assert.equal(totals.paid + totals.unpaid, totals.total);
    assert.equal(calculateLop(30000, totals.working, totals.unpaid), unpaid * 1000);
  }
});
