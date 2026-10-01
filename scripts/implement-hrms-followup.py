from pathlib import Path
def edit(path,fn):
 p=Path(path);p.write_text(fn(p.read_text(encoding='utf-8')),encoding='utf-8')

def server(s):
 s='import { registerHrmsPolicies } from "./hrmsPolicies.js";\n'+s
 s=s.replace('const buildHrmsSalaryPayload', 'const hrmsPolicies = registerHrmsPolicies({ app, getPool, sql, hrmsTable, hrmsObjectName, ensureEmployees: ensureHrmsEmployeesTable });\n\nconst buildHrmsSalaryPayload',1)
 s=s.replace('    for (const payload of payloads) {\n      savedRows.push', '''    for (const payload of payloads) {
      const policyYear = new Date(`1 ${payload.month}`).getFullYear() || Number(payload.month.slice(0,4));
      const policy = await hrmsPolicies.load(payload.employeeId, policyYear);
      payload.professionalTax = monthlyProfessionalTax(policy.ptRule, payload.month, payload.professionalTax);
      savedRows.push''',1)
 return s
edit('backend/src/server.js',server)
edit('src/services/hrmsRelievingApi.js',lambda s:s.replace('  emitHrmsRelievingChange();','  emitHrmsRelievingChange();\n  window.dispatchEvent(new Event("hrms:employees:changed"));'))
def routes(s):
 s='import HrmsReportDetails from "../pages/HrmsReportDetails";\n'+s
 return s.replace('        {HRMS_PAGE_ROUTES.map', '        <Route path="/hrms/reports/:reportType" element={<HrmsReportDetails />} />\n        <Route path="/reports/:reportType" element={<HrmsReportDetails />} />\n        {HRMS_PAGE_ROUTES.map')
edit('src/routes/AppRoutes.jsx',routes)
def ui(s):
 s='import EmployeeAttendanceSummary from "../components/hrms/EmployeeAttendanceSummary";\nimport ProfessionalTaxRule from "../components/hrms/ProfessionalTaxRule";\nimport api from "../services/api";\nimport { reportNames } from "./HrmsReportDetails";\n'+s
 s=s.replace('"Employment", "Salary", "Documents"','"Employment", "Salary", "Attendance", "Documents"')
 s=s.replace('      {profileTab === "Documents"', '      {profileTab === "Attendance" && <EmployeeAttendanceSummary employeeId={employee.id} />}\n      {profileTab === "Documents"',1)
 # Existing rich assessment records are shared between the new Review view and compensation view.
 s=s.replace('const SalaryReassessmentPage = () => {','const SalaryReassessmentPage = ({ reviewMode = false }) => {')
 for title in ['Performance Review','KPI / Performance Metrics','Promotion Management','Approval Workflow','Assessment Summary']:
  pos=s.index(f'<h2 className="text-sm font-bold">{title}</h2>',s.index('const SalaryReassessmentPage'))
  start=s.rfind('<Panel',0,pos);end=s.index('</Panel>',pos)+len('</Panel>')
  s=s[:start]+'{reviewMode && ('+s[start:end]+')}'+s[end:]
 pos=s.index('<h2 className="text-sm font-bold">Salary Reassessment</h2>',s.index('const SalaryReassessmentPage'))
 start=s.rfind('<Panel',0,pos);end=s.index('</Panel>',pos)+len('</Panel>')
 s=s[:start]+'{!reviewMode && ('+s[start:end]+')}'+s[end:]
 s=s.replace('<h2 className="text-base font-bold">Salary Reassessment Register</h2>','<h2 className="text-base font-bold">{reviewMode ? "Review Register" : "Salary Reassessment Register"}</h2>')
 s=s.replace('      return <ReviewsPage />;', '      return <ReviewWorkspace />;')
 s=s.replace('const renderPage =', '''const ReviewWorkspace = () => {
  const [view,setView] = useState("assessment");
  return <div className="grid gap-4"><Tabs items={[{id:"assessment",label:"Performance Review"},{id:"history",label:"Review History"}]} value={view} onChange={setView} />{view === "assessment" ? <SalaryReassessmentPage reviewMode /> : <ReviewsPage />}</div>;
};

const renderPage =''')
 # Report navigation remains visible alongside the employee report.
 pos=s.index('const HrmsReportsPage')
 a,b=s[:pos],s[pos:]
 b=b.replace('  const settings = useSettings();','  const settings = useSettings();\n  const [reportStatus,setReportStatus] = useState("All");\n  const [reportMonth,setReportMonth] = useState(new Date().toISOString().slice(0,7));',1)
 b=b.replace('return employees.map((employee) => {','return employees.filter((employee) => reportStatus === "All" || employee.status === reportStatus).map((employee) => {',1).replace('}, [employees, payrollBatches]);','}, [employees, payrollBatches, reportStatus]);',1)
 b=b.replace('    <div className="grid gap-4">','''    <div className="grid gap-4">
      <Panel><div className="flex gap-4"><Field label="Report month"><Input type="month" value={reportMonth} onChange={(e)=>setReportMonth(e.target.value)} /></Field><Field label="Employees"><Input as="select" value={reportStatus} onChange={(e)=>setReportStatus(e.target.value)}>{["All","Active","Relieved"].map((status)=><option key={status}>{status}</option>)}</Input></Field></div><div className="grid gap-3 md:grid-cols-3 mt-4">{Object.entries(reportNames).map(([key,title])=><div key={key} className="border rounded p-4"><h2 className="font-bold">{title}</h2><Link className="text-blue-700 block mt-2" to={`/hrms/reports/${key}?month=${reportMonth}&status=${reportStatus}`}>{key === "salary-summary" ? "View Salary Summary" : "Generate"}</Link></div>)}</div></Panel>''',1)
 s=a+b
 # PT policy is loaded for the selected month and calculated before payroll save.
 pos=s.index('const PayrollPage');end=s.index('const PayslipPage')
 part=s[pos:end]
 part=part.replace('  const [payrollEdits, setPayrollEdits] = useState({});','''  const [payrollEdits, setPayrollEdits] = useState({});
  const [ptRules,setPtRules] = useState({});
  useEffect(() => {
    let live=true;
    const year=String(getAttendanceMonthDate(month)?.getFullYear() || new Date().getFullYear());
    Promise.all(allEmployees.map(async (employee) => [employee.id, (await api.get(`/hrms/payroll-rules/${encodeURIComponent(employee.id)}/${year}`)).data.ptRule])).then((entries) => {if(live)setPtRules(Object.fromEntries(entries));}).catch(() => {if(live)setMessage("Could not load annual PT rules. Check the connection before generating payroll.");});
    return () => {live=false;};
  },[allEmployees,month]);''')
 part=part.replace('const rowProfessionalTax = toSalaryNumber(\n      edit.professionalTax,\n      employeeBreakup.professionalTax\n    );','const rowProfessionalTax = monthlyProfessionalTax(ptRules[employee.id], month, toSalaryNumber(edit.professionalTax, employeeBreakup.professionalTax));')
 part=part.replace('            <Field label="Annual Gross Salary">','            <ProfessionalTaxRule employeeId={selectedPayrollRow.id} year={getAttendanceMonthDate(month)?.getFullYear()} onSaved={(rule)=>setPtRules((current)=>({...current,[selectedPayrollRow.id]:rule}))} />\n            <Field label="Annual Gross Salary">',1)
 s=s[:pos]+part+s[end:]
 return s
edit('src/pages/HrmsPlaceholder.jsx',ui)
