import { monthlyProfessionalTax } from '../../shared/payroll.js';

export function registerHrmsPolicies({ app, getPool, sql, hrmsTable, hrmsObjectName, ensureEmployees }) {
  let ready;
  const ensure = () => ready ||= (async () => {
    await ensureEmployees();
    const pool = await getPool();
    await pool.request().query(`IF OBJECT_ID(N'${hrmsObjectName('EmployeePayrollPolicies')}',N'U') IS NULL
      CREATE TABLE ${hrmsTable('EmployeePayrollPolicies')} (EmployeeID VARCHAR(20) NOT NULL, PolicyYear INT NOT NULL,
      LeaveEntitlement DECIMAL(6,2) NULL, PTRuleJson NVARCHAR(MAX) NULL,
      CONSTRAINT PK_EmployeePayrollPolicies PRIMARY KEY(EmployeeID,PolicyYear));`);
  })().catch((error) => { ready = null; throw error; });
  const validate = (id, year) => {
    if (!id || !/^\d{4}$/.test(String(year)) || Number(year)<1900 || Number(year)>2200) throw Object.assign(new Error('Valid employee and year are required.'),{statusCode:400});
  };
  const load = async (employeeId, year, source) => {
    await ensure(); validate(employeeId,year);
    const pool = source || await getPool();
    const result = await pool.request().input('EmployeeID',sql.VarChar(20),employeeId).input('Year',sql.Int,year).query(`SELECT LeaveEntitlement,PTRuleJson FROM ${hrmsTable('EmployeePayrollPolicies')} WHERE EmployeeID=@EmployeeID AND PolicyYear=@Year`);
    const row=result.recordset[0];
    return { entitlement: row?.LeaveEntitlement ?? null, ptRule: row?.PTRuleJson ? JSON.parse(row.PTRuleJson) : null };
  };
  for (const kind of ['leave-entitlements','payroll-rules']) {
    app.get(`/api/hrms/${kind}/:id/:year`,async(req,res) => {
      try {res.json(await load(req.params.id,req.params.year));} catch(error) {res.status(error.statusCode || 500).json({error:error.message});}
    });
    app.put(`/api/hrms/${kind}/:id/:year`,async(req,res) => {
      try {
        await ensure(); validate(req.params.id,req.params.year);
        const leave = kind === 'leave-entitlements';
        const entitlement=Number(req.body.entitlement);
        if(leave && (!Number.isFinite(entitlement) || entitlement<0 || entitlement>366)) throw Object.assign(new Error('Leave entitlement must be between 0 and 366 days.'),{statusCode:400});
        if(!leave) monthlyProfessionalTax(req.body.ptRule,`${req.params.year}-01`);
        const pool=await getPool();
        const result=await pool.request().input('EmployeeID',sql.VarChar(20),req.params.id).query(`SELECT EmployeeID FROM ${hrmsTable('Employees')} WHERE EmployeeID=@EmployeeID`);
        if(!result.recordset.length) return res.status(404).json({error:'Employee not found.'});
        await pool.request().input('EmployeeID',sql.VarChar(20),req.params.id).input('Year',sql.Int,req.params.year)
          .input('Value',leave ? sql.Decimal(6,2) : sql.NVarChar(sql.MAX),leave ? entitlement : JSON.stringify(req.body.ptRule))
          .query(`MERGE ${hrmsTable('EmployeePayrollPolicies')} WITH (HOLDLOCK) AS t USING (SELECT @EmployeeID AS EmployeeID,@Year AS PolicyYear) AS s
            ON t.EmployeeID=s.EmployeeID AND t.PolicyYear=s.PolicyYear
            WHEN MATCHED THEN UPDATE SET ${leave ? 'LeaveEntitlement' : 'PTRuleJson'}=@Value
            WHEN NOT MATCHED THEN INSERT(EmployeeID,PolicyYear,${leave ? 'LeaveEntitlement' : 'PTRuleJson'}) VALUES(@EmployeeID,@Year,@Value);`);
        res.json(await load(req.params.id,req.params.year));
      } catch(error) {res.status(error.statusCode || 500).json({error:error.message});}
    });
  }
  return { ensure, load };
}
