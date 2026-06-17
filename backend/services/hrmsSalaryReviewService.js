// HRMS Salary Components and Reviews Service
// Location: backend/services/hrmsSalaryReviewService.js

import sql from 'mssql';

/**
 * Create/Update salary components for an employee
 */
export const saveSalaryComponents = async (pool, employeeId, components) => {
  const {
    year,
    month,
    basicSalary = 0,
    hra = 0,
    travelAllowance = 0,
    medicalAllowance = 0,
    otherAllowances = 0,
    tds = 0,
    professionalTax = 0,
    providentFund = 0
  } = components;

  // Calculate derived values
  const grossSalary = Number(basicSalary) + Number(hra) + Number(travelAllowance) + 
                     Number(medicalAllowance) + Number(otherAllowances);
  const totalDeductions = Number(tds) + Number(professionalTax) + Number(providentFund);
  const netSalary = grossSalary - totalDeductions;

  // Check if record exists
  const existing = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('Year', sql.Int, year)
    .input('Month', sql.Int, month)
    .query(`
      SELECT ComponentId FROM HRMS_DB.dbo.EmployeeSalaryComponents
      WHERE EmployeeId = @EmployeeId AND Year = @Year AND Month = @Month
    `);

  if (existing.recordset && existing.recordset.length > 0) {
    // Update existing
    const result = await pool
      .request()
      .input('ComponentId', sql.Int, existing.recordset[0].ComponentId)
      .input('BasicSalary', sql.Decimal(18, 2), basicSalary)
      .input('HRA', sql.Decimal(18, 2), hra)
      .input('TravelAllowance', sql.Decimal(18, 2), travelAllowance)
      .input('MedicalAllowance', sql.Decimal(18, 2), medicalAllowance)
      .input('OtherAllowances', sql.Decimal(18, 2), otherAllowances)
      .input('GrossSalary', sql.Decimal(18, 2), grossSalary)
      .input('TDS', sql.Decimal(18, 2), tds)
      .input('ProfessionalTax', sql.Decimal(18, 2), professionalTax)
      .input('ProvidentFund', sql.Decimal(18, 2), providentFund)
      .input('TotalDeductions', sql.Decimal(18, 2), totalDeductions)
      .input('NetSalary', sql.Decimal(18, 2), netSalary)
      .query(`
        UPDATE HRMS_DB.dbo.EmployeeSalaryComponents
        SET BasicSalary = @BasicSalary,
            HRA = @HRA,
            TravelAllowance = @TravelAllowance,
            MedicalAllowance = @MedicalAllowance,
            OtherAllowances = @OtherAllowances,
            GrossSalary = @GrossSalary,
            TDS = @TDS,
            ProfessionalTax = @ProfessionalTax,
            ProvidentFund = @ProvidentFund,
            TotalDeductions = @TotalDeductions,
            NetSalary = @NetSalary,
            UpdatedAt = SYSUTCDATETIME()
        WHERE ComponentId = @ComponentId
        
        SELECT * FROM HRMS_DB.dbo.EmployeeSalaryComponents
        WHERE ComponentId = @ComponentId
      `);

    return result.recordset[0];
  } else {
    // Insert new
    const result = await pool
      .request()
      .input('EmployeeId', sql.Int, employeeId)
      .input('Year', sql.Int, year)
      .input('Month', sql.Int, month)
      .input('BasicSalary', sql.Decimal(18, 2), basicSalary)
      .input('HRA', sql.Decimal(18, 2), hra)
      .input('TravelAllowance', sql.Decimal(18, 2), travelAllowance)
      .input('MedicalAllowance', sql.Decimal(18, 2), medicalAllowance)
      .input('OtherAllowances', sql.Decimal(18, 2), otherAllowances)
      .input('GrossSalary', sql.Decimal(18, 2), grossSalary)
      .input('TDS', sql.Decimal(18, 2), tds)
      .input('ProfessionalTax', sql.Decimal(18, 2), professionalTax)
      .input('ProvidentFund', sql.Decimal(18, 2), providentFund)
      .input('TotalDeductions', sql.Decimal(18, 2), totalDeductions)
      .input('NetSalary', sql.Decimal(18, 2), netSalary)
      .query(`
        INSERT INTO HRMS_DB.dbo.EmployeeSalaryComponents
          (EmployeeId, Year, Month, BasicSalary, HRA, TravelAllowance, 
           MedicalAllowance, OtherAllowances, GrossSalary, TDS, ProfessionalTax, 
           ProvidentFund, TotalDeductions, NetSalary)
        OUTPUT INSERTED.*
        VALUES (@EmployeeId, @Year, @Month, @BasicSalary, @HRA, @TravelAllowance,
                @MedicalAllowance, @OtherAllowances, @GrossSalary, @TDS, @ProfessionalTax,
                @ProvidentFund, @TotalDeductions, @NetSalary)
      `);

    return result.recordset[0];
  }
};

/**
 * Get salary components for an employee
 */
export const getEmployeeSalaryComponents = async (pool, employeeId, year = null, month = null) => {
  let query = `
    SELECT * FROM HRMS_DB.dbo.EmployeeSalaryComponents
    WHERE EmployeeId = @EmployeeId
  `;

  const request = pool.request().input('EmployeeId', sql.Int, employeeId);

  if (year) {
    query += ' AND Year = @Year';
    request.input('Year', sql.Int, year);
  }

  if (month) {
    query += ' AND Month = @Month';
    request.input('Month', sql.Int, month);
  }

  query += ' ORDER BY Year DESC, Month DESC';

  const result = await request.query(query);
  return result.recordset || [];
};

/**
 * Create employee review
 */
export const createEmployeeReview = async (pool, employeeId, reviewData) => {
  const {
    reviewFromDate,
    reviewToDate,
    previousSalary = 0,
    newSalary = 0,
    reviewerName = '',
    reviewNotes = ''
  } = reviewData;

  // Calculate salary increase and percentage
  const salaryIncrease = Number(newSalary) - Number(previousSalary);
  const incrementPercentage = previousSalary > 0 
    ? ((salaryIncrease / previousSalary) * 100).toFixed(2)
    : 0;

  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('ReviewFromDate', sql.Date, new Date(reviewFromDate))
    .input('ReviewToDate', sql.Date, new Date(reviewToDate))
    .input('PreviousSalary', sql.Decimal(18, 2), previousSalary)
    .input('NewSalary', sql.Decimal(18, 2), newSalary)
    .input('SalaryIncrease', sql.Decimal(18, 2), salaryIncrease)
    .input('IncrementPercentage', sql.Decimal(5, 2), incrementPercentage)
    .input('ReviewerName', sql.VarChar(255), reviewerName)
    .input('ReviewNotes', sql.NVarChar(sql.MAX), reviewNotes)
    .input('Status', sql.VarChar(20), 'Draft')
    .query(`
      INSERT INTO HRMS_DB.dbo.EmployeeReviews
        (EmployeeId, ReviewFromDate, ReviewToDate, PreviousSalary, NewSalary, 
         SalaryIncrease, IncrementPercentage, ReviewerName, ReviewNotes, Status)
      OUTPUT INSERTED.*
      VALUES (@EmployeeId, @ReviewFromDate, @ReviewToDate, @PreviousSalary, @NewSalary,
              @SalaryIncrease, @IncrementPercentage, @ReviewerName, @ReviewNotes, @Status)
    `);

  return result.recordset[0];
};

/**
 * Get employee reviews
 */
export const getEmployeeReviews = async (pool, employeeId) => {
  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .query(`
      SELECT * FROM HRMS_DB.dbo.EmployeeReviews
      WHERE EmployeeId = @EmployeeId
      ORDER BY CreatedAt DESC
    `);

  return result.recordset || [];
};

/**
 * Get review comparison
 */
export const getReviewComparison = async (pool, employeeId, fromReviewId, toReviewId) => {
  const result = await pool
    .request()
    .input('EmployeeId', sql.Int, employeeId)
    .input('FromReviewId', sql.Int, fromReviewId)
    .input('ToReviewId', sql.Int, toReviewId)
    .query(`
      SELECT 
        f.ReviewId as FromReviewId,
        f.ReviewFromDate as FromDate,
        f.NewSalary as FromSalary,
        t.ReviewId as ToReviewId,
        t.ReviewFromDate as ToDate,
        t.NewSalary as ToSalary,
        t.NewSalary - f.NewSalary as SalaryDifference,
        CASE 
          WHEN f.NewSalary > 0 
          THEN ((t.NewSalary - f.NewSalary) / f.NewSalary * 100)
          ELSE 0
        END as PercentageDifference
      FROM HRMS_DB.dbo.EmployeeReviews f
      CROSS JOIN HRMS_DB.dbo.EmployeeReviews t
      WHERE f.EmployeeId = @EmployeeId
        AND t.EmployeeId = @EmployeeId
        AND f.ReviewId = @FromReviewId
        AND t.ReviewId = @ToReviewId
    `);

  return result.recordset[0] || null;
};

/**
 * Update review status
 */
export const updateReviewStatus = async (pool, reviewId, status, approvedBy = null) => {
  const result = await pool
    .request()
    .input('ReviewId', sql.Int, reviewId)
    .input('Status', sql.VarChar(20), status)
    .input('ApprovedBy', sql.VarChar(255), approvedBy)
    .input('ApprovedDate', sql.DateTime2, new Date())
    .query(`
      UPDATE HRMS_DB.dbo.EmployeeReviews
      SET Status = @Status,
          ApprovedBy = @ApprovedBy,
          ApprovedDate = @ApprovedDate,
          UpdatedAt = SYSUTCDATETIME()
      WHERE ReviewId = @ReviewId
      
      SELECT * FROM HRMS_DB.dbo.EmployeeReviews WHERE ReviewId = @ReviewId
    `);

  return result.recordset[0];
};

export default {
  saveSalaryComponents,
  getEmployeeSalaryComponents,
  createEmployeeReview,
  getEmployeeReviews,
  getReviewComparison,
  updateReviewStatus
};
