// HRMS Exit Employee Service
// Location: backend/services/hrmsExitService.js

import sql from 'mssql';

/**
 * Create exit request for employee
 */
export const createExitRequest = async (pool, employeeId, exitData) => {
  const {
    exitDate,
    exitReason = '',
    noticePeriodDays = 30,
    noticeStartDate = new Date()
  } = exitData;

  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('ExitDate', sql.Date, new Date(exitDate))
    .input('ExitReason', sql.VarChar(255), exitReason)
    .input('NoticePeriodDays', sql.Int, noticePeriodDays)
    .input('NoticeStartDate', sql.Date, new Date(noticeStartDate))
    .input('Status', sql.VarChar(20), 'Pending')
    .query(`
      INSERT INTO HRMS_DB.dbo.EmployeeExit
        (EmployeeId, ExitDate, ExitReason, NoticePeriodDays, NoticeStartDate, Status)
      OUTPUT INSERTED.*
      VALUES (@EmployeeId, @ExitDate, @ExitReason, @NoticePeriodDays, @NoticeStartDate, @Status)
    `);

  // Update employee status to Exiting
  await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .query(`
      UPDATE HRMS_DB.dbo.Employees
      SET Status = 'Exiting'
      WHERE EmployeeID = @EmployeeId
    `);

  return result.recordset[0];
};

/**
 * Get exit requests
 */
export const getExitRequests = async (pool, status = null) => {
  let query = `
    SELECT 
      e.ExitId,
      e.EmployeeId,
      emp.EmployeeID as EmployeeCode,
      emp.FullName as EmployeeName,
      emp.Designation,
      emp.Department,
      e.ExitDate,
      e.ExitReason,
      e.NoticePeriodDays,
      e.NoticeStartDate,
      e.FinalSettlementStatus,
      e.FinalSettlementAmount,
      e.Status,
      e.ProcessedBy,
      e.ProcessedDate,
      e.CreatedAt
    FROM HRMS_DB.dbo.EmployeeExit e
    JOIN HRMS_DB.dbo.Employees emp ON e.EmployeeId = emp.EmployeeID
    WHERE 1=1
  `;

  const request = pool.request();

  if (status) {
    query += ' AND e.Status = @Status';
    request.input('Status', sql.VarChar(20), status);
  }

  query += ' ORDER BY e.CreatedAt DESC';

  const result = await request.query(query);
  return result.recordset || [];
};

/**
 * Update exit status
 */
export const updateExitStatus = async (pool, exitId, status, processedBy = null) => {
  const result = await pool
    .request()
    .input('ExitId', sql.Int, exitId)
    .input('Status', sql.VarChar(20), status)
    .input('ProcessedBy', sql.VarChar(255), processedBy)
    .query(`
      UPDATE HRMS_DB.dbo.EmployeeExit
      SET Status = @Status,
          ProcessedBy = @ProcessedBy,
          ProcessedDate = SYSUTCDATETIME(),
          UpdatedAt = SYSUTCDATETIME()
      WHERE ExitId = @ExitId
      
      SELECT * FROM HRMS_DB.dbo.EmployeeExit WHERE ExitId = @ExitId
    `);

  if (result.recordset && result.recordset.length > 0) {
    const exitRecord = result.recordset[0];

    // If exit is completed, update employee status
    if (status === 'Completed') {
      await pool
        .request()
        .input('EmployeeId', sql.Int, exitRecord.EmployeeId)
        .query(`
          UPDATE HRMS_DB.dbo.Employees
          SET Status = 'Exited'
          WHERE EmployeeID = @EmployeeId
        `);
    }
  }

  return result.recordset[0];
};

/**
 * Save final settlement details
 */
export const saveFinalSettlement = async (pool, exitId, settlementData) => {
  const {
    finalSettlementAmount = 0,
    documents = null
  } = settlementData;

  const documentsJson = documents ? JSON.stringify(documents) : null;

  const result = await pool
    .request()
    .input('ExitId', sql.Int, exitId)
    .input('FinalSettlementAmount', sql.Decimal(18, 2), finalSettlementAmount)
    .input('FinalSettlementStatus', sql.VarChar(20), 'Completed')
    .input('Documents', sql.NVarChar(sql.MAX), documentsJson)
    .query(`
      UPDATE HRMS_DB.dbo.EmployeeExit
      SET FinalSettlementAmount = @FinalSettlementAmount,
          FinalSettlementStatus = @FinalSettlementStatus,
          Documents = @Documents,
          UpdatedAt = SYSUTCDATETIME()
      WHERE ExitId = @ExitId
      
      SELECT * FROM HRMS_DB.dbo.EmployeeExit WHERE ExitId = @ExitId
    `);

  return result.recordset[0];
};

/**
 * Get employee exit details
 */
export const getEmployeeExitDetails = async (pool, employeeId) => {
  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .query(`
      SELECT * FROM HRMS_DB.dbo.EmployeeExit
      WHERE EmployeeId = @EmployeeId
      ORDER BY CreatedAt DESC
    `);

  return result.recordset || [];
};

/**
 * Get employees with specific status (Active, Exiting, Exited)
 */
export const getEmployeesByStatus = async (pool, status = 'Active', limit = 100, offset = 0) => {
  const result = await pool
    .request()
    .input('Status', sql.VarChar(20), status)
    .input('Limit', sql.Int, limit)
    .input('Offset', sql.Int, offset)
    .query(`
      SELECT *
      FROM HRMS_DB.dbo.Employees
      WHERE Status = @Status
      ORDER BY EmployeeID DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `);

  const countResult = await pool
    .request()
    .input('Status', sql.VarChar(20), status)
    .query(`
      SELECT COUNT(*) as TotalCount FROM HRMS_DB.dbo.Employees WHERE Status = @Status
    `);

  return {
    employees: result.recordset || [],
    total: countResult.recordset[0]?.TotalCount || 0,
    limit,
    offset
  };
};

/**
 * Get exit statistics
 */
export const getExitStatistics = async (pool) => {
  const result = await pool.query(`
    SELECT 
      Status,
      COUNT(*) as Count,
      COUNT(DISTINCT EmployeeId) as UniqueEmployees
    FROM HRMS_DB.dbo.EmployeeExit
    GROUP BY Status
  `);

  const employeeStatuses = await pool.query(`
    SELECT 
      Status,
      COUNT(*) as Count
    FROM HRMS_DB.dbo.Employees
    GROUP BY Status
  `);

  return {
    exitStatistics: result.recordset || [],
    employeeStatuses: employeeStatuses.recordset || []
  };
};

export default {
  createExitRequest,
  getExitRequests,
  updateExitStatus,
  saveFinalSettlement,
  getEmployeeExitDetails,
  getEmployeesByStatus,
  getExitStatistics
};
