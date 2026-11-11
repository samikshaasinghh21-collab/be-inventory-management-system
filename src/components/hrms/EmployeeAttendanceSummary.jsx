import { useEffect, useState } from "react";
import api from "../../services/api";
import { fetchHrmsAttendance } from "../../services/hrmsAttendanceApi";
import { monthKey } from "../../../shared/payroll";

export default function EmployeeAttendanceSummary({ employeeId }) {
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7));
  const [records,setRecords] = useState([]), [entitlement,setEntitlement] = useState("");
  const [savedEntitlement, setSavedEntitlement] = useState(null);
  const [error,setError] = useState(""), [loading,setLoading] = useState(true), [message,setMessage] = useState("");
  const year = month.slice(0,4);
  useEffect(() => {
    let live=true; setLoading(true); setError(""); setMessage("");
    Promise.all([fetchHrmsAttendance(),api.get(`/hrms/leave-entitlements/${encodeURIComponent(employeeId)}/${year}`)]).then(([attendance,response]) => {
      if(live) { setRecords(attendance.filter((r) => String(r.employeeId) === String(employeeId))); setEntitlement(response.data.entitlement ?? ""); setSavedEntitlement(response.data.entitlement ?? null); }
    }).catch((err) => { if(live) setError(err.response?.data?.error || "Unable to load attendance and leave."); }).finally(() => { if(live) setLoading(false); });
    return () => {live=false;};
  },[employeeId,year]);
  const row=records.find((r) => monthKey(r.month) === month);
  const used=records.filter((r) => monthKey(r.month).startsWith(year)).reduce((sum,r) => sum+Number(r.counts?.L || 0),0);
  const save=async () => { try { setError(""); const response = await api.put(`/hrms/leave-entitlements/${encodeURIComponent(employeeId)}/${year}`,{entitlement:Number(entitlement)}); setSavedEntitlement(response.data.entitlement); setMessage("Leave entitlement saved."); } catch(err) {setError(err.response?.data?.error || "Could not save entitlement.");} };
  return <section className="bg-white rounded-xl p-5 space-y-4"><h2 className="font-bold">Monthly attendance and leave</h2><label>Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}{message && <p>{message}</p>}{loading ? <p>Loading…</p> : !error && <><p>{row ? `Present: ${row.counts.P} · Absent: ${row.counts.A} · Leave: ${row.counts.L} · Half Day: ${row.counts.H}  |  Holiday: ${row.counts.O || 0}` : "No attendance saved for this month."}</p>
    <label>Individual leave entitlement for {year} <input type="number" min="0" max="366" step="0.5" value={entitlement} onChange={(e) => setEntitlement(e.target.value)} /></label><button className="ml-3 text-blue-700" disabled={entitlement === ""} onClick={save}>Save entitlement</button><p>Leave used ({year}): {used} · Leave remaining: {savedEntitlement === null ? "Entitlement not configured" : Math.max(0,Number(savedEntitlement)-used)}{savedEntitlement !== null && used>Number(savedEntitlement) ? ` · Exceeded by ${used-Number(savedEntitlement)}` : ""}</p></>}
  </section>;
}
