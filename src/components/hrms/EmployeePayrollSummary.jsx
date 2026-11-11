import { useEffect, useState } from "react";
import { fetchHrmsSalaries } from "../../services/hrmsSalariesApi";
import { monthKey } from "../../../shared/payroll";
import { parseDateValue } from "../../utils/dateFormat";

export default function EmployeePayrollSummary({ employeeId }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    fetchHrmsSalaries().then((rows) => {
      if (live) setRecords(rows.filter((row) => String(row.employeeId) === String(employeeId)).sort((a, b) =>
        (parseDateValue(b.savedAt)?.getTime() || 0) - (parseDateValue(a.savedAt)?.getTime() || 0) || Number(b.id) - Number(a.id)
      ));
    }).catch((err) => {
      if (live) setError(err.response?.data?.error || "Unable to load saved payroll.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [employeeId]);
  const row = records.find((record) => monthKey(record.month) === month);
  const items = [
    ["Monthly Gross Salary", "monthlySalary"], ["LOP", "lopAmount"],
    ["PT", "professionalTax"], ["ESI", "esiAmount"], ["TDS", "tdsAmount"],
    ["Reimbursement", "reimbursement"], ["Allowance", "allowances"],
    ["PF", "pfAmount"], ["Other deduction", "deduction"], ["Net Salary", "netSalary"],
  ];
  return <section className="my-5 space-y-3">
    <h3 className="font-bold">Saved monthly payroll</h3>
    <label>Payroll month <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
    {loading ? <p>Loading saved payroll...</p> : error ? <p role="alert">{error}</p> : row ?
      <dl className="people-detail-list people-detail-columns">{items.map(([label, key]) =>
        <div key={key}><dt>{label}</dt><dd>Rs. {Number(row[key] || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
      )}</dl> : <p>No saved payroll for this month.</p>}
  </section>;
}
