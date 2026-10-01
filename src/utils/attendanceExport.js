import * as XLSX from 'xlsx';
import { attendanceStatuses, attendanceTotals } from '../../shared/attendance.js';

export function attendanceWorkbook(records, month) {
  const days = attendanceStatuses([], month).length;
  const rows = [['Employee ID', 'Employee', 'Month', ...Array.from({ length: days }, (_, i) => i + 1), 'Present (P)', 'Absent (A)', 'Leave (L)', 'Half Day (H)', 'Holiday (O)', 'Total Days', 'Days Worked', 'Unpaid Days']];
  for (const record of records) {
    const statuses = attendanceStatuses(record.statuses, month);
    const t = attendanceTotals(statuses);
    rows.push([record.employeeId, record.employeeName, month, ...statuses, t.P, t.A, t.L, t.H, t.O, t.total, t.worked, t.unpaid]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = rows[0].map((_, i) => ({ wch: i === 1 ? 28 : i < 3 ? 20 : i < days + 3 ? 4 : 16 }));
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance Register');
  return workbook;
}

export function downloadAttendance(records, month) {
  XLSX.writeFile(attendanceWorkbook(records, month), `Attendance-${month}.xlsx`);
}
