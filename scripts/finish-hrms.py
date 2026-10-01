from pathlib import Path
def edit(path,fn):
 p=Path(path);p.write_text(fn(p.read_text(encoding='utf-8')),encoding='utf-8')
edit('src/components/inventory/Product.jsx',lambda s:'export { default } from "./ProductLogGate";\n')
def server(s):
 s='import { registerProductLogAccess } from "./productLogAccess.js";\n'+s
 s=s.replace('app.use("/api/auth", createAuthRouter());','app.use("/api/auth", createAuthRouter());\nregisterProductLogAccess(app, {getPool,sql,ensureAuthSchema});')
 # Add a correctly calculated computed column, after the optional columns exist.
 start=s.index('let ensureHrmsSalariesTablePromise');end=s.index('const hrmsPolicies')
 part=s[start:end]
 pos=part.index('    `);')+len('    `);')
 part=part[:pos]+'''
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM ${toIdentifier(HRMS_DATABASE_NAME)}.sys.computed_columns c
        JOIN ${toIdentifier(HRMS_DATABASE_NAME)}.sys.tables t ON t.object_id=c.object_id
        WHERE t.name='Salaries' AND c.name='NetSalary' AND c.definition NOT LIKE '%LOPAmount%')
      BEGIN
        ALTER TABLE ${hrmsTable("Salaries")} DROP COLUMN NetSalary;
        ALTER TABLE ${hrmsTable("Salaries")} ADD NetSalary AS
          (ROUND(ISNULL(BasicSalary,0)/12,0)+ISNULL(Allowances,0)+ISNULL(Reimbursement,0)
          -ISNULL(LOPAmount,0)-ISNULL(Deductions,0)-ISNULL(PFAmount,0)-ISNULL(ESIAmount,0)-ISNULL(ProfessionalTax,0)-ISNULL(TDSAmount,0));
      END
    `);
'''+part[pos:]
 s=s[:start]+part+s[end:]
 # Ensure policy schema before payroll transaction, avoiding schema locks inside it.
 start=s.index('app.post("/api/hrms/salaries"');end=s.index('app.delete("/api/hrms/salaries"')
 part=s[start:end].replace('    await ensureHrmsSalariesTable();','    await ensureHrmsSalariesTable();\n    await hrmsPolicies.ensure();',1)
 s=s[:start]+part+s[end:]
 return s
edit('backend/src/server.js',server)
def ui(s):
 start=s.index('const PayrollPage');end=s.index('const PayslipPage')
 part=s[start:end]
 part=part.replace('  const savePayroll = async () => {','  const savePayroll = async () => {\n    if (rows.some((row) => row.unpaidDays < 0 || row.workingDays < 0 || row.unpaidDays > row.workingDays)) { setMessage("Unpaid days must be between zero and working days."); return; }')
 old='"Monthly Gross", "Allowances", "Deduction", "Monthly PF", "Monthly ESI", "TDS", "PT"'
 part=part.replace(old,'"Monthly Gross", "LOP", "PT", "ESI", "TDS", "Reimbursement", "Allowance", "Other Deduction", "Monthly PF"')
 startcell=part.index('                  <td className="px-3 py-3">{money(row.allowances)}</td>')
 endcell=part.index('                  <td className="px-3 py-3 font-bold">',startcell)
 part=part[:startcell]+''.join(f'                  <td className="px-3 py-3">{{money(row.{field})}}</td>\n' for field in ['lopAmount','professionalTax','esiAmount','tdsAmount','reimbursement','allowances','deduction','pfAmount'])+part[endcell:]
 part=part.replace('colSpan={13}','colSpan={15}')
 # register/print order
 part=part.replace('            "Allowances",\n            "Deduction",\n            "Monthly PF",\n            "Monthly ESI",\n            "TDS",\n            "PT",','            "LOP", "PT", "ESI", "TDS", "Reimbursement", "Allowance", "Other Deduction", "Monthly PF",')
 part=part.replace('              money(row.allowances),\n              money(row.deduction),\n              money(row.pfAmount),\n              money(row.esiAmount),\n              money(row.tdsAmount),\n              money(row.professionalTax),','              money(row.lopAmount), money(row.professionalTax), money(row.esiAmount), money(row.tdsAmount), money(row.reimbursement), money(row.allowances), money(row.deduction), money(row.pfAmount),')
 # Reorder salary processing inputs to required sequence after the LOP inputs.
 labels=['LOP','Applicable working days','Unpaid days','PT','Monthly ESI','TDS','Reimbursement','Allowances','Deduction','Monthly PF']
 import re
 blocks=[]
 for label in labels:
  pattern=r'            <Field label="'+re.escape(label)+r'">[\s\S]*?</Field>'
  match=re.search(pattern,part)
  if match: blocks.append(match.group());part=part[:match.start()]+part[match.end():]
 marker='            <Field label="Status">'
 part=part.replace(marker,'\n'.join(blocks)+'\n'+marker,1)
 s=s[:start]+part+s[end:]
 # All-employee printed report also uses PAN.
 start=s.index('const HrmsReportsPage');end=s.index('const PermissionsPage')
 part=s[start:end].replace('Aadhaar Number','PAN Number').replace('employee.documentNumber','employee.panNumber').replace('email, Aadhaar','email, PAN')
 s=s[:start]+part+s[end:]
 return s
edit('src/pages/HrmsPlaceholder.jsx',ui)
