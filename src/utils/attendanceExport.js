import * as XLSX from 'xlsx';
import { attendanceDates, attendanceStatuses, attendanceTotals } from '../../shared/attendance.js';

export function attendanceWorkbook(records, month) {
  const dates = attendanceDates(month).map(date => {
    const [year, number, day] = date.split('-').map(Number);
    return new Date(year, number - 1, day);
  });
  const days = dates.length;
  const rows = [['Employee ID', 'Employee', 'Month', ...dates, 'Present Days', 'Absent Days', 'Leave Days', 'Half Days', 'Holidays', 'Total Days', 'Days Worked', 'Unpaid Days', 'Paid Days']];
  for (const record of records) {
    const statuses = attendanceStatuses(record.statuses, month);
    const t = attendanceTotals(statuses);
    const workedDays = statuses.map(status => status === 'P' ? 1 : status === 'H' ? 0.5 : 0);
    rows.push([record.employeeId, record.employeeName, month, ...workedDays, t.P, t.A, t.L, t.H, t.O, t.total, t.worked, t.unpaid, t.paid]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows, { dateNF: 'dd/mm/yyyy' });
  sheet['!cols'] = rows[0].map((_, i) => ({ wch: i === 1 ? 28 : i < 3 ? 20 : i < days + 3 ? 12 : 16 }));
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance Register');
  return workbook;
}

export function downloadAttendance(records, month) {
  XLSX.writeFile(attendanceWorkbook(records, month), `Attendance-${month}.xlsx`);
}
