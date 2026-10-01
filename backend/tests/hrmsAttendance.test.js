import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { attendanceStatuses, attendanceTotals } from '../../shared/attendance.js';
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
  assert.equal(calculateLop(27000, totals.working, totals.unpaid), 1500);
});
test('Excel round-trip preserves every employee, day and numeric totals', () => {
  const workbook = attendanceWorkbook([{employeeId:'001', employeeName:'Employee One', statuses:['H','A','L','O']}, {employeeId:'002', employeeName:'Employee Two', statuses:[]}], '2026-02');
  const bytes = XLSX.write(workbook, {type:'buffer', bookType:'xlsx'});
  const read = XLSX.read(bytes, {type:'buffer'});
  const rows = XLSX.utils.sheet_to_json(read.Sheets['Attendance Register'], {header:1});
  assert.equal(rows.length, 3); assert.equal(rows[1][0], '001');
  assert.deepEqual(rows[1].slice(3,7), ['H','A','L','O']);
  assert.deepEqual(rows[1].slice(-8), [24,1,1,1,1,28,24.5,1.5]);
  assert.deepEqual(rows[2].slice(-8), [28,0,0,0,0,28,28,0]);
});
