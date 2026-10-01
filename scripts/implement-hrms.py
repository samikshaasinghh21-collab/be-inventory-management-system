from pathlib import Path

def edit(path, fn):
    p = Path(path)
    p.write_text(fn(p.read_text(encoding='utf-8')), encoding='utf-8')

edit('src/routes/AppRoutes.jsx', lambda s: s.replace('import Vendors from', 'import PartyDetails from "../components/inventory/PartyDetails";\nimport Vendors from').replace('<Route path="/inventory/vendors"', '<Route path="/inventory/vendors/:id" element={<PartyDetails kind="vendors" />} />\n        <Route path="/inventory/customers/:id" element={<PartyDetails kind="customers" />} />\n        <Route path="/inventory/vendors"'))
edit('src/components/inventory/Vendors.jsx', lambda s: s.replace('onClick={() => openEdit(vendor)}', 'onClick={() => openEdit(vendor)}', 1).replace('<div className="flex gap-2">\n                      <button', '<div className="flex gap-2">\n                      <button type="button" className="text-blue-700 text-xs" onClick={() => navigate(`/inventory/vendors/${vendor.id}`)}>View</button>\n                      <button', 1))
edit('src/components/inventory/Customers.jsx', lambda s: 'import { Link } from "react-router-dom";\n' + s.replace('<div className="flex gap-2">\n                      <button', '<div className="flex gap-2">\n                      <Link className="text-blue-700 text-xs" to={`/inventory/customers/${customer.id}`}>View</Link>\n                      <button', 1))

# Payroll snapshots keep the LOP basis and reimbursements separate from other deductions.
def backend(s):
    s = 'import { calculateLop, monthlyProfessionalTax } from "../../shared/payroll.js";\n' + s
    start, end = s.index('const buildHrmsSalaryPayload'), s.index('const loadHrmsSalaryRowsByIds')
    part = s[start:end]
    part = part.replace('const netSalary =\n', 'const workingDays = Number(source.workingDays ?? 0);\n  const unpaidDays = Number(source.unpaidDays ?? 0);\n  const lopAmount = calculateLop(calculateHrmsMonthlyGross(basicSalary), workingDays, unpaidDays);\n  const reimbursement = normalizeHrmsDecimal(source.reimbursement);\n  const netSalary =\n', 1)
    part = part.replace(' + allowances - deductions -', ' + allowances + reimbursement - lopAmount - deductions -', 1)
    part = part.replace('    basicSalary,\n', '    workingDays, unpaidDays, lopAmount, reimbursement,\n    basicSalary,\n', 1)
    part = part.replace('  const totalDeductions =\n', '  const lopAmount = Number(row.LOPAmount ?? 0);\n  const reimbursement = Number(row.Reimbursement ?? 0);\n  const totalDeductions =\n', 1)
    part = part.replace('    deductions + pfAmount', '    lopAmount + deductions + pfAmount', 1).replace('monthlySalary + allowances - totalDeductions', 'monthlySalary + allowances + reimbursement - totalDeductions')
    part = part.replace('    id: String(row.Id', '    lopAmount, reimbursement, workingDays: Number(row.WorkingDays ?? 0), unpaidDays: Number(row.UnpaidDays ?? 0),\n    id: String(row.Id')
    part = part.replace('totalEarnings: monthlySalary + allowances,', 'totalEarnings: monthlySalary + allowances + reimbursement,')
    s = s[:start] + part + s[end:]
    start,end = s.index('const bindHrmsSalaryInputs'),s.index('app.get("/api/hrms/salaries"')
    part=s[start:end].replace('    .input("EmployeeID",', '    .input("WorkingDays", sql.Decimal(6,2), payload.workingDays)\n    .input("UnpaidDays", sql.Decimal(6,2), payload.unpaidDays)\n    .input("LOPAmount", sql.Decimal(12,2), payload.lopAmount)\n    .input("Reimbursement", sql.Decimal(12,2), payload.reimbursement)\n    .input("EmployeeID",',1)
    part=part.replace('        BasicSalary = @BasicSalary,', '        WorkingDays = @WorkingDays, UnpaidDays = @UnpaidDays, LOPAmount = @LOPAmount, Reimbursement = @Reimbursement,\n        BasicSalary = @BasicSalary,')
    part=part.replace('        BasicSalary,','        WorkingDays, UnpaidDays, LOPAmount, Reimbursement,\n        BasicSalary,').replace('      BasicSalary,','      WorkingDays, UnpaidDays, LOPAmount, Reimbursement,\n      BasicSalary,')
    # avoid duplicated columns from overlapping indentation replacements
    part=part.replace('        WorkingDays, UnpaidDays, LOPAmount, Reimbursement,\n        WorkingDays, UnpaidDays, LOPAmount, Reimbursement,','        WorkingDays, UnpaidDays, LOPAmount, Reimbursement,')
    part=part.replace('        @BasicSalary,','        @WorkingDays, @UnpaidDays, @LOPAmount, @Reimbursement,\n        @BasicSalary,').replace('      @BasicSalary,','      @WorkingDays, @UnpaidDays, @LOPAmount, @Reimbursement,\n      @BasicSalary,')
    part=part.replace('        @WorkingDays, @UnpaidDays, @LOPAmount, @Reimbursement,\n        @WorkingDays, @UnpaidDays, @LOPAmount, @Reimbursement,','        @WorkingDays, @UnpaidDays, @LOPAmount, @Reimbursement,')
    s=s[:start]+part+s[end:]
    marker='const buildHrmsSalaryPayload'
    pos=s.index(marker)
    before=s[:pos]
    at=before.rfind('    `);')
    sql=''
    for col,typ in [('WorkingDays','DECIMAL(6,2)'),('UnpaidDays','DECIMAL(6,2)'),('LOPAmount','DECIMAL(12,2)'),('Reimbursement','DECIMAL(12,2)')]:
        sql+=f"\n      IF COL_LENGTH(N'${{hrmsObjectName(\"Salaries\")}}', N'{col}') IS NULL ALTER TABLE ${{hrmsTable(\"Salaries\")}} ADD {col} {typ} NULL;\n"
    s=before[:at]+sql+before[at:]+s[pos:]
    # Relieving and employee status must commit together.
    start,end=s.index('app.post("/api/hrms/relieving"'),s.index('app.get("/api/hrms/employees"')
    part=s[start:end].replace('  try {','  let tx;\n  try {',1)
    part=part.replace('    const hasIdentityId =', '    tx = pool.transaction();\n    await tx.begin();\n    const employeeCheck = await createDbRequest(tx).input("EmployeeID", sql.VarChar(20), payload.employeeId).query(`SELECT EmployeeID FROM ${hrmsTable("Employees")} WITH (UPDLOCK, HOLDLOCK) WHERE EmployeeID=@EmployeeID`);\n    if (!employeeCheck.recordset.length) throw Object.assign(new Error("Employee not found."), {statusCode:404});\n    const hasIdentityId =',1)
    part=part.replace('isHrmsRelievingIdIdentity(pool)','isHrmsRelievingIdIdentity(tx)').replace('getNextHrmsRelievingId(pool)','getNextHrmsRelievingId(tx)').replace('pool.request()', 'createDbRequest(tx)')
    part=part.replace('    const relievingRecord =', '    if (payload.status.toLowerCase() === "relieved") {\n      await createDbRequest(tx).input("EmployeeID", sql.VarChar(20), payload.employeeId).query(`UPDATE ${hrmsTable("Employees")} SET Status=\'Relieved\' WHERE EmployeeID=@EmployeeID`);\n    }\n    await tx.commit();\n    const relievingRecord =')
    part=part.replace('  } catch (error) {', '  } catch (error) {\n    await rollbackTx(tx);')
    s=s[:start]+part+s[end:]
    return s
edit('backend/src/server.js', backend)

def salary_api(s):
    s=s.replace('  const totalDeductions = deduction', '  const lopAmount = toNumber(record.lopAmount ?? record.LOPAmount);\n  const reimbursement = toNumber(record.reimbursement ?? record.Reimbursement);\n  const totalDeductions = lopAmount + deduction')
    s=s.replace('const totalEarnings = monthlySalary + allowance;', 'const totalEarnings = monthlySalary + allowance + reimbursement;')
    return s.replace('    ...record,', '    ...record,\n    lopAmount, reimbursement,',1)
edit('src/services/hrmsSalariesApi.js', salary_api)

def ui(s):
    s='import { calculateLop, monthlyProfessionalTax } from "../../shared/payroll.js";\n'+s
    a,b=s.index('const getSalaryBreakup'),s.index('const getFormSalaryBreakup')
    part=s[a:b].replace('  const totalEarnings = monthlySalary + allowances;', '  const lopAmount = toSalaryNumber(source.lopAmount);\n  const reimbursement = toSalaryNumber(source.reimbursement);\n  const totalEarnings = monthlySalary + allowances + reimbursement;').replace('    deduction + pfAmount','    lopAmount + deduction + pfAmount').replace('    allowances,','    lopAmount, reimbursement,\n    allowances,',1)
    s=s[:a]+part+s[b:]
    a,b=s.index('const PayrollPage'),s.index('const PayslipPage')
    part=s[a:b].replace('const [employees] = useHrmsEmployees();','const [allEmployees] = useHrmsEmployees();\n  const employees = allEmployees.filter((employee) => employee.status === "Active");\n  const [attendance] = useHrmsAttendance();')
    part=part.replace('    const totalDeductions =', '    const attendanceRow = attendance.find((record) => record.employeeId === employee.id && areAttendanceMonthsEqual(record.month, month));\n    const workingDays = toSalaryNumber(edit.workingDays, attendanceRow ? getAttendanceDays(month).length - attendanceRow.counts.H : 0);\n    const unpaidDays = toSalaryNumber(edit.unpaidDays, attendanceRow?.counts.A ?? 0);\n    const lopAmount = unpaidDays <= workingDays ? calculateLop(calculateMonthlySalary(salary), workingDays, unpaidDays) : 0;\n    const reimbursement = toSalaryNumber(edit.reimbursement);\n    const totalDeductions =',1).replace('      rowDeduction + rowPfAmount', '      lopAmount + rowDeduction + rowPfAmount',1).replace('monthlySalary + rowAllowances;', 'monthlySalary + rowAllowances + reimbursement;',1).replace('      ...employee,','      ...employee,\n      workingDays, unpaidDays, lopAmount, reimbursement,',1)
    needle='            <Field label="Allowances">'
    fields='''            <Field label="LOP"><Input value={money(selectedPayrollRow.lopAmount)} disabled /></Field>
            <Field label="Applicable working days"><Input type="number" min="0" max="31" step="0.5" value={selectedPayrollRow.workingDays} onChange={(e) => updatePayrollEdit("workingDays", e.target.value)} /></Field>
            <Field label="Unpaid days"><Input type="number" min="0" max={selectedPayrollRow.workingDays} step="0.5" value={selectedPayrollRow.unpaidDays} onChange={(e) => updatePayrollEdit("unpaidDays", e.target.value)} /></Field>
            {selectedPayrollRow.unpaidDays > selectedPayrollRow.workingDays && <p role="alert">Unpaid days cannot exceed working days.</p>}
            <Field label="Reimbursement"><Input type="number" min="0" value={selectedPayrollRow.reimbursement} onChange={(e) => updatePayrollEdit("reimbursement", e.target.value)} /></Field>
'''
    part=part.replace(needle,fields+needle,1)
    s=s[:a]+part+s[b:]
    s=s.replace('["Allowances", payrollBreakup.allowances],','["Reimbursement", payrollBreakup.reimbursement],\n        ["Allowance", payrollBreakup.allowances],')
    s=s.replace('["Deduction", payrollBreakup.deduction],\n        ["Monthly PF", payrollBreakup.pfAmount],\n        ["Monthly ESI", payrollBreakup.esiAmount],\n        ["TDS", payrollBreakup.tdsAmount],\n        ["Professional Tax", payrollBreakup.professionalTax],','["LOP", payrollBreakup.lopAmount],\n        ["PT", payrollBreakup.professionalTax],\n        ["ESI", payrollBreakup.esiAmount],\n        ["TDS", payrollBreakup.tdsAmount],\n        ["Other deduction", payrollBreakup.deduction],\n        ["Monthly PF", payrollBreakup.pfAmount],')
    s=s.replace('["Aadhaar Number", displayValue(employee.documentNumber)]','["PAN Number", displayValue(employee.panNumber)]').replace('["Aadhaar Number", displayValue(employee?.documentNumber)]','["PAN Number", displayValue(employee?.panNumber)]').replace('["Aadhaar Number", employee.documentNumber]','["PAN Number", employee.panNumber]')
    s=s.replace('<h1>Bangalore Electronics</h1>', '<img src="${escapeHtml(new URL(defaultBrandLogoUrl, window.location.origin).href)}" alt="Company logo" style="max-height:70px;max-width:180px" /><h1>Bangalore Electronics</h1>',1)
    a=s.index('const RelievingLetterDocument')
    s=s[:a]+s[a:].replace('<h2 className="text-xl font-bold text-slate-950">','<img src={defaultBrandLogoUrl} alt="Company logo" className="h-16 w-auto mb-2" />\n          <h2 className="text-xl font-bold text-slate-950">',1)
    return s
edit('src/pages/HrmsPlaceholder.jsx',ui)
