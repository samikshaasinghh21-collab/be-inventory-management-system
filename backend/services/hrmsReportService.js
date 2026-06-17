// HRMS Report Generation Service
// Location: backend/services/hrmsReportService.js

import sql from 'mssql';

/**
 * Format date to MM/DD/YYYY
 */
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${month}/${day}/${year}`;
};

/**
 * Generate employee report with pagination
 */
export const generateEmployeeReport = async (pool, filters = {}, page = 1, pageSize = 50) => {
  const {
    status = 'Active',
    department = null,
    designation = null,
    searchTerm = null
  } = filters;

  const offset = (page - 1) * pageSize;

  // Build query
  let whereClause = 'WHERE e.Status = @Status';
  const request = pool.request()
    .input('Status', sql.VarChar(20), status)
    .input('Limit', sql.Int, pageSize)
    .input('Offset', sql.Int, offset);

  if (department) {
    whereClause += ' AND e.Department = @Department';
    request.input('Department', sql.VarChar(255), department);
  }

  if (designation) {
    whereClause += ' AND e.Designation = @Designation';
    request.input('Designation', sql.VarChar(255), designation);
  }

  if (searchTerm) {
    whereClause += ' AND (e.FullName LIKE @SearchTerm OR e.Email LIKE @SearchTerm OR e.EmployeeID LIKE @SearchTerm)';
    request.input('SearchTerm', sql.VarChar(255), `%${searchTerm}%`);
  }

  // Get total count
  const countResult = await request.query(`
    SELECT COUNT(*) as TotalCount FROM HRMS_DB.dbo.Employees e
    ${whereClause}
  `);

  // Get paginated data
  const dataResult = await pool.request()
    .input('Status', sql.VarChar(20), status)
    .input('Limit', sql.Int, pageSize)
    .input('Offset', sql.Int, offset)
    .input('Department', sql.VarChar(255), department)
    .input('Designation', sql.VarChar(255), designation)
    .input('SearchTerm', sql.VarChar(255), searchTerm ? `%${searchTerm}%` : null)
    .query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY e.EmployeeID) + @Offset as SerialNumber,
        e.EmployeeID,
        e.FullName,
        e.Email,
        e.Phone,
        e.Department,
        e.Designation,
        e.DateOfBirth,
        e.Gender,
        e.MaritalStatus,
        e.Nationality,
        e.Address,
        e.BloodGroup,
        e.PANNumber,
        e.Status,
        e.BasicSalary,
        e.GrossSalary,
        e.ProvidentFund,
        e.ESIAmount,
        e.CreatedAt
      FROM HRMS_DB.dbo.Employees e
      ${whereClause}
      ORDER BY e.EmployeeID DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `);

  const employees = (dataResult.recordset || []).map((emp, index) => ({
    serialNumber: offset + index + 1,
    ...emp,
    dateOfBirth: formatDate(emp.DateOfBirth),
    createdAt: formatDate(emp.CreatedAt),
    basicSalary: emp.BasicSalary ? parseFloat(emp.BasicSalary).toFixed(2) : '0.00',
    grossSalary: emp.GrossSalary ? parseFloat(emp.GrossSalary).toFixed(2) : '0.00',
    pfAmount: emp.ProvidentFund ? parseFloat(emp.ProvidentFund).toFixed(2) : '0.00',
    esiAmount: emp.ESIAmount ? parseFloat(emp.ESIAmount).toFixed(2) : '0.00'
  }));

  const totalRecords = countResult.recordset[0]?.TotalCount || 0;
  const totalPages = Math.ceil(totalRecords / pageSize);

  return {
    data: employees,
    pagination: {
      currentPage: page,
      pageSize,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};

/**
 * Generate salary report
 */
export const generateSalaryReport = async (pool, filters = {}, page = 1, pageSize = 50) => {
  const {
    year,
    month,
    department = null,
    status = 'Active'
  } = filters;

  if (!year || !month) {
    throw new Error('Year and Month are required');
  }

  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE sc.Year = @Year AND sc.Month = @Month AND e.Status = @Status';
  const request = pool.request()
    .input('Year', sql.Int, year)
    .input('Month', sql.Int, month)
    .input('Status', sql.VarChar(20), status)
    .input('Limit', sql.Int, pageSize)
    .input('Offset', sql.Int, offset);

  if (department) {
    whereClause += ' AND e.Department = @Department';
    request.input('Department', sql.VarChar(255), department);
  }

  // Get total count
  const countResult = await request.query(`
    SELECT COUNT(*) as TotalCount 
    FROM HRMS_DB.dbo.EmployeeSalaryComponents sc
    JOIN HRMS_DB.dbo.Employees e ON sc.EmployeeId = e.EmployeeID
    ${whereClause}
  `);

  // Get paginated salary data
  const dataResult = await pool.request()
    .input('Year', sql.Int, year)
    .input('Month', sql.Int, month)
    .input('Status', sql.VarChar(20), status)
    .input('Limit', sql.Int, pageSize)
    .input('Offset', sql.Int, offset)
    .input('Department', sql.VarChar(255), department)
    .query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY e.EmployeeID) + @Offset as SerialNumber,
        e.EmployeeID,
        e.FullName as EmployeeName,
        e.Department,
        e.Designation,
        sc.BasicSalary,
        sc.HRA,
        sc.TravelAllowance,
        sc.MedicalAllowance,
        sc.OtherAllowances,
        sc.GrossSalary,
        sc.TDS,
        sc.ProfessionalTax,
        sc.ProvidentFund,
        sc.TotalDeductions,
        sc.NetSalary
      FROM HRMS_DB.dbo.EmployeeSalaryComponents sc
      JOIN HRMS_DB.dbo.Employees e ON sc.EmployeeId = e.EmployeeID
      ${whereClause}
      ORDER BY e.EmployeeID DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `);

  const salaries = (dataResult.recordset || []).map((sal, index) => ({
    serialNumber: offset + index + 1,
    ...sal,
    basicSalary: sal.BasicSalary ? parseFloat(sal.BasicSalary).toFixed(2) : '0.00',
    hra: sal.HRA ? parseFloat(sal.HRA).toFixed(2) : '0.00',
    travelAllowance: sal.TravelAllowance ? parseFloat(sal.TravelAllowance).toFixed(2) : '0.00',
    medicalAllowance: sal.MedicalAllowance ? parseFloat(sal.MedicalAllowance).toFixed(2) : '0.00',
    otherAllowances: sal.OtherAllowances ? parseFloat(sal.OtherAllowances).toFixed(2) : '0.00',
    grossSalary: sal.GrossSalary ? parseFloat(sal.GrossSalary).toFixed(2) : '0.00',
    tds: sal.TDS ? parseFloat(sal.TDS).toFixed(2) : '0.00',
    pt: sal.ProfessionalTax ? parseFloat(sal.ProfessionalTax).toFixed(2) : '0.00',
    pf: sal.ProvidentFund ? parseFloat(sal.ProvidentFund).toFixed(2) : '0.00',
    totalDeductions: sal.TotalDeductions ? parseFloat(sal.TotalDeductions).toFixed(2) : '0.00',
    netSalary: sal.NetSalary ? parseFloat(sal.NetSalary).toFixed(2) : '0.00'
  }));

  const totalRecords = countResult.recordset[0]?.TotalCount || 0;
  const totalPages = Math.ceil(totalRecords / pageSize);

  return {
    data: salaries,
    pagination: {
      currentPage: page,
      pageSize,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    },
    summary: {
      year,
      month,
      monthName: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1]
    }
  };
};

/**
 * Generate attendance report
 */
export const generateAttendanceReport = async (pool, filters = {}, page = 1, pageSize = 50) => {
  const {
    year,
    month,
    status = 'Active'
  } = filters;

  if (!year || !month) {
    throw new Error('Year and Month are required');
  }

  const offset = (page - 1) * pageSize;

  // Get employee list
  const employeeResult = await pool.request()
    .input('Status', sql.VarChar(20), status)
    .input('Limit', sql.Int, pageSize)
    .input('Offset', sql.Int, offset)
    .query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY EmployeeID) + @Offset as SerialNumber,
        EmployeeID,
        FullName as EmployeeName,
        Department,
        Designation
      FROM HRMS_DB.dbo.Employees
      WHERE Status = @Status
      ORDER BY EmployeeID DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `);

  // Get attendance summary for each employee
  const attendanceData = [];

  for (const emp of employeeResult.recordset || []) {
    const summary = await pool
      .request()
      .input('EmployeeId', sql.Int, emp.EmployeeID)
      .input('Year', sql.Int, year)
      .input('Month', sql.Int, month)
      .query(`
        SELECT 
          COUNT(*) as TotalDays,
          SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) as PresentDays,
          SUM(CASE WHEN Status = 'Absent' THEN 1 ELSE 0 END) as AbsentDays,
          SUM(CASE WHEN Status = 'Leave' THEN 1 ELSE 0 END) as LeaveDays,
          SUM(CASE WHEN Status = 'Holiday' THEN 1 ELSE 0 END) as HolidayDays,
          CAST(SUM(CASE WHEN Status = 'Present' THEN 1 ELSE 0 END) as FLOAT) / 
          NULLIF(COUNT(*), 0) * 100 as AttendancePercentage
        FROM HRMS_DB.dbo.AttendanceRecords
        WHERE EmployeeId = @EmployeeId
          AND YEAR(AttendanceDate) = @Year
          AND MONTH(AttendanceDate) = @Month
      `);

    const summaryStat = summary.recordset[0] || {
      TotalDays: 0,
      PresentDays: 0,
      AbsentDays: 0,
      LeaveDays: 0,
      HolidayDays: 0,
      AttendancePercentage: 0
    };

    attendanceData.push({
      serialNumber: emp.SerialNumber,
      employeeId: emp.EmployeeID,
      employeeName: emp.EmployeeName,
      department: emp.Department,
      designation: emp.Designation,
      ...summaryStat,
      attendancePercentage: summaryStat.AttendancePercentage ? parseFloat(summaryStat.AttendancePercentage).toFixed(2) : '0.00'
    });
  }

  const totalRecords = (await pool.request()
    .input('Status', sql.VarChar(20), status)
    .query('SELECT COUNT(*) as TotalCount FROM HRMS_DB.dbo.Employees WHERE Status = @Status')).recordset[0]?.TotalCount || 0;

  const totalPages = Math.ceil(totalRecords / pageSize);

  return {
    data: attendanceData,
    pagination: {
      currentPage: page,
      pageSize,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    },
    summary: {
      year,
      month,
      monthName: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1]
    }
  };
};

export default {
  generateEmployeeReport,
  generateSalaryReport,
  generateAttendanceReport,
  formatDate
};
