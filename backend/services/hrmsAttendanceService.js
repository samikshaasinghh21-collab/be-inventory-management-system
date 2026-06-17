// HRMS Attendance and Calendar Service
// Location: backend/services/hrmsAttendanceService.js

import sql from 'mssql';

/**
 * Get day of week (0 = Sunday, 6 = Saturday)
 * Properly handles timezone considerations
 */
export const getDayOfWeek = (date) => {
  const d = new Date(date);
  return d.getUTCDay(); // Use UTC to avoid timezone issues
};

/**
 * Save attendance record
 */
export const saveAttendanceRecord = async (pool, attendanceData) => {
  const {
    employeeId,
    attendanceDate,
    status = 'Present',
    leaveType = null,
    workedHours = 8,
    notes = ''
  } = attendanceData;

  const dayOfWeek = getDayOfWeek(attendanceDate);

  // Check if record already exists
  const existing = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('AttendanceDate', sql.Date, new Date(attendanceDate))
    .query(`
      SELECT AttendanceId FROM HRMS_DB.dbo.AttendanceRecords
      WHERE EmployeeId = @EmployeeId AND AttendanceDate = @AttendanceDate
    `);

  if (existing.recordset && existing.recordset.length > 0) {
    // Update existing
    const result = await pool
      .request()
      .input('AttendanceId', sql.Int, existing.recordset[0].AttendanceId)
      .input('DayOfWeek', sql.Int, dayOfWeek)
      .input('Status', sql.VarChar(20), status)
      .input('LeaveType', sql.VarChar(50), leaveType)
      .input('WorkedHours', sql.Decimal(5, 2), workedHours)
      .input('Notes', sql.NVarChar(sql.MAX), notes)
      .query(`
        UPDATE HRMS_DB.dbo.AttendanceRecords
        SET DayOfWeek = @DayOfWeek,
            Status = @Status,
            LeaveType = @LeaveType,
            WorkedHours = @WorkedHours,
            Notes = @Notes,
            UpdatedAt = SYSUTCDATETIME()
        WHERE AttendanceId = @AttendanceId
        
        SELECT * FROM HRMS_DB.dbo.AttendanceRecords WHERE AttendanceId = @AttendanceId
      `);

    return result.recordset[0];
  } else {
    // Insert new
    const result = await pool
      .request()
      .input('EmployeeId', sql.Int, employeeId)
      .input('AttendanceDate', sql.Date, new Date(attendanceDate))
      .input('DayOfWeek', sql.Int, dayOfWeek)
      .input('Status', sql.VarChar(20), status)
      .input('LeaveType', sql.VarChar(50), leaveType)
      .input('WorkedHours', sql.Decimal(5, 2), workedHours)
      .input('Notes', sql.NVarChar(sql.MAX), notes)
      .query(`
        INSERT INTO HRMS_DB.dbo.AttendanceRecords
          (EmployeeId, AttendanceDate, DayOfWeek, Status, LeaveType, WorkedHours, Notes)
        OUTPUT INSERTED.*
        VALUES (@EmployeeId, @AttendanceDate, @DayOfWeek, @Status, @LeaveType, @WorkedHours, @Notes)
      `);

    return result.recordset[0];
  }
};

/**
 * Get attendance records for month
 */
export const getMonthlyAttendance = async (pool, employeeId, year, month) => {
  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('Year', sql.Int, year)
    .input('Month', sql.Int, month)
    .query(`
      SELECT * FROM HRMS_DB.dbo.AttendanceRecords
      WHERE EmployeeId = @EmployeeId
        AND YEAR(AttendanceDate) = @Year
        AND MONTH(AttendanceDate) = @Month
      ORDER BY AttendanceDate ASC
    `);

  return result.recordset || [];
};

/**
 * Get calendar for month - returns proper day/date mapping
 */
export const getMonthCalendar = async (pool, year, month) => {
  // Get all holidays for the month
  const holidays = await pool
    .request()
    .input('Year', sql.Int, year)
    .input('Month', sql.Int, month)
    .query(`
      SELECT HolidayDate, HolidayName, DayOfWeek
      FROM HRMS_DB.dbo.Holidays
      WHERE YEAR(HolidayDate) = @Year AND MONTH(HolidayDate) = @Month
      ORDER BY HolidayDate ASC
    `);

  // Generate calendar days
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getUTCDay(); // 0 = Sunday

  const calendarDays = [];

  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getUTCDay();
    const isHoliday = holidays.recordset.some(h => {
      const hDate = new Date(h.HolidayDate);
      return hDate.getUTCDate() === day;
    });

    calendarDays.push({
      date: day,
      dayOfWeek,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      isHoliday,
      holidayName: isHoliday ? holidays.recordset.find(h => {
        const hDate = new Date(h.HolidayDate);
        return hDate.getUTCDate() === day;
      })?.HolidayName : null
    });
  }

  return {
    year,
    month,
    monthName: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1],
    daysInMonth,
    startingDayOfWeek,
    calendarDays,
    holidays: holidays.recordset || []
  };
};

/**
 * Bulk save attendance records
 */
export const bulkSaveAttendance = async (pool, attendanceRecords) => {
  const results = [];

  for (const record of attendanceRecords) {
    try {
      const result = await saveAttendanceRecord(pool, record);
      results.push({ ...record, success: true, result });
    } catch (error) {
      results.push({ ...record, success: false, error: error.message });
    }
  }

  return results;
};

/**
 * Get attendance summary
 */
export const getAttendanceSummary = async (pool, employeeId, year, month) => {
  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('Year', sql.Int, year)
    .input('Month', sql.Int, month)
    .query(`
      SELECT 
        COUNT(*) as TotalDays,
        SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) as PresentDays,
        SUM(CASE WHEN Status = 'Absent' THEN 1 ELSE 0 END) as AbsentDays,
        SUM(CASE WHEN Status = 'Leave' THEN 1 ELSE 0 END) as LeaveDays,
        SUM(CASE WHEN Status = 'Holiday' THEN 1 ELSE 0 END) as HolidayDays,
        SUM(ISNULL(WorkedHours, 0)) as TotalWorkedHours
      FROM HRMS_DB.dbo.AttendanceRecords
      WHERE EmployeeId = @EmployeeId
        AND YEAR(AttendanceDate) = @Year
        AND MONTH(AttendanceDate) = @Month
    `);

  return result.recordset[0] || {
    TotalDays: 0,
    PresentDays: 0,
    AbsentDays: 0,
    LeaveDays: 0,
    HolidayDays: 0,
    TotalWorkedHours: 0
  };
};

/**
 * Add holiday to calendar
 */
export const addHoliday = async (pool, holidayDate, holidayName, isNationalHoliday = true) => {
  const dayOfWeek = getDayOfWeek(holidayDate);

  try {
    const result = await pool
      .request()
      .input('HolidayDate', sql.Date, new Date(holidayDate))
      .input('HolidayName', sql.VarChar(255), holidayName)
      .input('DayOfWeek', sql.Int, dayOfWeek)
      .input('IsNationalHoliday', sql.Bit, isNationalHoliday ? 1 : 0)
      .query(`
        INSERT INTO HRMS_DB.dbo.Holidays
          (HolidayDate, HolidayName, DayOfWeek, IsNationalHoliday)
        OUTPUT INSERTED.*
        VALUES (@HolidayDate, @HolidayName, @DayOfWeek, @IsNationalHoliday)
      `);

    return result.recordset[0];
  } catch (error) {
    if (error.number === 2627) { // Unique constraint violation
      throw new Error('Holiday already exists for this date');
    }
    throw error;
  }
};

export default {
  getDayOfWeek,
  saveAttendanceRecord,
  getMonthlyAttendance,
  getMonthCalendar,
  bulkSaveAttendance,
  getAttendanceSummary,
  addHoliday
};
