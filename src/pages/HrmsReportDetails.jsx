import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchAllHrmsEmployees } from "../services/hrmsEmployeesApi";
import { fetchHrmsAttendance } from "../services/hrmsAttendanceApi";
import { fetchHrmsSalaries } from "../services/hrmsSalariesApi";
import { fetchHrmsReviews } from "../services/hrmsReviewsApi";
import { fetchHrmsSalaryReassessments } from "../services/hrmsSalaryReassessmentsApi";
import { fetchHrmsRelieving } from "../services/hrmsRelievingApi";
import { monthKey } from "../../shared/payroll";
import { parseDateValue } from "../utils/dateFormat";
import { reportNames } from "../utils/hrmsReports";

const cash = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateMonth = (value) => { const date = parseDateValue(value); return date && !Number.isNaN(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}` : ""; };
export default function HrmsReportDetails() {
  const { reportType } = useParams();
  const [search, setSearch] = useSearchParams();
  const month = search.get("month") || new Date().toISOString().slice(0,7);
  const status = search.get("status") || "All";
  const employeeId = search.get("employee") || "";
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState(null), [refresh, setRefresh] = useState(0);
  const update = (key, value) => { const next = new URLSearchParams(search); next.set(key,value); setSearch(next); };
  useEffect(() => {
    let live = true; setLoading(true); setError(""); setSelected(null); setRows([]);
    const load = async () => {
      if (!reportNames[reportType]) return;
      const employees = await fetchAllHrmsEmployees();
      let records = reportType === "attendance" ? await fetchHrmsAttendance() : reportType === "review" ? [...await fetchHrmsReviews(), ...await fetchHrmsSalaryReassessments()] : reportType === "relieving" ? await fetchHrmsRelieving() : await fetchHrmsSalaries();
      if (["payroll", "salary-summary"].includes(reportType)) {
        const latest = new Map();
        records = [...records].sort((a, b) =>
          (parseDateValue(b.savedAt)?.getTime() || 0) - (parseDateValue(a.savedAt)?.getTime() || 0) || Number(b.id) - Number(a.id)
        );
        for (const row of records) { const key = `${row.employeeId}:${(monthKey(row.month) || dateMonth(row.month))}`; if (!latest.has(key)) latest.set(key, row); }
        records = [...latest.values()];
      }
      const result = records.filter((row) => {
        const employee = employees.find((e) => String(e.id) === String(row.employeeId));
        const recordMonth = (monthKey(row.month) || dateMonth(row.month)) || dateMonth(reportType === "relieving" ? row.lastWorkingDate : row.reviewDate || row.effectiveDate || row.reviewEndDate || row.savedAt);
        return (month === "all" || recordMonth === month) && (!employeeId || String(row.employeeId) === employeeId) && (status === "All" || String(employee?.status).trim().toLowerCase() === status.toLowerCase());
      }).map((row, index) => {
        const employee = employees.find((e) => String(e.id) === String(row.employeeId));
        const recordMonth = (monthKey(row.month) || dateMonth(row.month)) || dateMonth(reportType === "relieving" ? row.lastWorkingDate : row.reviewDate || row.effectiveDate || row.reviewEndDate || row.savedAt);
        let details;
        if (reportType === "attendance") details = { Present: row.counts?.P ?? 0, Absent: row.counts?.A ?? 0, Leave: row.counts?.L ?? 0, "Half days": row.counts?.H ?? 0, Holiday: row.counts?.O ?? 0, "Working days": row.counts?.working ?? 0, "Unpaid days": row.counts?.unpaid ?? 0 };
        else if (reportType === "review") details = { "Review date": row.reviewDate || row.effectiveDate || row.reviewEndDate, "Review period": row.reviewPeriod || row.period, Score: row.overallScore ?? row.reviewScore ?? row.score ?? row.rating, Grade: row.grade, Status: row.status || row.salaryStatus, "HR comments": row.hrComments || row.comments, "Manager comments": row.managerComments, Strengths: row.strengths, "Areas for improvement": row.improvement };
        else if (reportType === "relieving") details = { "Last working date": row.lastWorkingDate, "Resignation date": row.resignationDate, "Notice period": row.noticePeriod, Status: row.status, ...Object.fromEntries((row.checklist || []).map((item) => [item.label, item.checked ? "Complete" : "Pending"])) };
        else details = { "Monthly Gross Salary": cash(row.monthlySalary), LOP: cash(row.lopAmount), PT: cash(row.professionalTax), ESI: cash(row.esiAmount), TDS: cash(row.tdsAmount), Reimbursement: cash(row.reimbursement), Allowance: cash(row.allowances), PF: cash(row.pfAmount), "Other deduction": cash(row.deduction), "Working days": row.workingDays ?? row.WorkingDays ?? "Not recorded", "Unpaid days": row.unpaidDays ?? row.UnpaidDays ?? "Not recorded", "Net Salary": cash(row.netSalary) };
        details = { "Employee ID": row.employeeId, "Employee name": employee?.name || row.employeeName, Department: employee?.department, Designation: employee?.designation, Email: employee?.email, Phone: employee?.phone, "Joining date": employee?.joined, ...details };
        return { key: `${row.id}-${index}`, employeeId: row.employeeId, name: employee?.name || row.employeeName, status: employee?.status || "Unknown", month: recordMonth || "Not recorded", details, net: Number(row.netSalary || 0) };
      });
      if (live) setRows(result);
    };
    load().catch((err) => { if (live) setError(err.response?.data?.error || err.message || "Unable to load report."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reportType, month, status, employeeId, refresh]);
  if (!reportNames[reportType]) return <p>Report not found.</p>;
  return <section className="space-y-5 rounded-xl bg-white p-6">
    <Link to="/hrms/reports" className="text-blue-700 print:hidden">Back to HR Reports</Link>
    <h1 className="text-xl font-bold">{reportNames[reportType]} — {month === "all" ? "All months" : month}</h1>
    <div className="flex flex-wrap gap-4 print:hidden"><label>Month <input aria-label="Report month" type="month" value={month === "all" ? "" : month} onChange={(e) => update("month",e.target.value || "all")} /></label><label><input type="checkbox" checked={month === "all"} onChange={(e) => update("month",e.target.checked ? "all" : new Date().toISOString().slice(0,7))} /> All months</label><label>Employees <select value={status} onChange={(e) => update("status",e.target.value)}>{["All","Active","Relieved"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Employee ID <input value={employeeId} onChange={(e) => update("employee", e.target.value)} placeholder="All employees" /></label>
      <button onClick={() => setRefresh((n) => n+1)} disabled={loading}>{reportType === "salary-summary" ? "View Salary Summary" : "Generate"}</button><button onClick={() => window.print()} disabled={loading || !!error}>Print</button></div>
    {error && <p role="alert">{error}</p>}{loading ? <p>Loading saved records…</p> : !error && <><p>{rows.length} saved records · {status} employees{["payroll","salary-summary"].includes(reportType) && ` · Total net salary: ${cash(rows.reduce((sum,row) => sum+row.net,0))}`}</p>
    <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Employee ID","Employee","Month","Employee status","Details"].map((h) => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.key}><td className="p-3">{row.employeeId}</td><td>{row.name}</td><td>{row.month}</td><td>{row.status}</td><td><button className="text-blue-700" onClick={() => setSelected(row)}>View Details</button></td></tr>)}</tbody></table></div>{!rows.length && <p>No saved records for this month and employee filter.</p>}</>}
    {employeeId && <nav aria-label="Employee history" className="flex flex-wrap gap-4 print:hidden">{Object.entries(reportNames).map(([key, title]) => <Link key={key} className="text-blue-700" to={`/hrms/reports/${key}?month=${month}&status=${status}&employee=${encodeURIComponent(employeeId)}`}>{title}</Link>)}</nav>}
    {selected && <article className="border rounded p-4"><h2 className="font-bold">{selected.name} ({selected.employeeId}) — {selected.month}</h2><dl className="grid gap-3 md:grid-cols-2 mt-4">{Object.entries(selected.details).map(([key,value]) => <div key={key}><dt className="text-slate-500">{key}</dt><dd>{value ?? "—"}</dd></div>)}</dl><button className="mt-4 print:hidden" onClick={() => setSelected(null)}>Close details</button></article>}
  </section>;
}
