import { getPool } from '../backend/src/config/db.js';
const pool = await getPool();
try {
  const name = process.env.HRMS_DB_NAME || process.env.HRMS_DATABASE || 'HRMS_DB';
  if (!/^[\w-]+$/.test(name)) throw new Error('Invalid database name');
  for (const query of [
    `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM [${name}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('Employees','Salaries','Attendance','SalaryReassessments','Reviews','Relieving') ORDER BY TABLE_NAME,ORDINAL_POSITION`,
    `SELECT Status,COUNT(*) AS Records FROM [${name}].dbo.Employees GROUP BY Status`,
    `SELECT TOP 5 PayrollMonth,COUNT(*) AS Records FROM [${name}].dbo.Salaries GROUP BY PayrollMonth`,
  ]) console.log(JSON.stringify((await pool.request().query(query)).recordset));
} finally { await pool.close(); }
