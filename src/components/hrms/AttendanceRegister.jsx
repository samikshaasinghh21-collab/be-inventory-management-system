import { useState } from 'react';
import Button from '../common/Button';
import { attendanceDates, attendanceStatuses, attendanceTotals, formatAttendanceDate } from '../../../shared/attendance.js';
import { monthKey } from '../../../shared/payroll.js';
import { downloadAttendance } from '../../utils/attendanceExport.js';
import { saveHrmsAttendance, getHrmsAttendanceErrorMessage } from '../../services/hrmsAttendanceApi';

export default function AttendanceRegister({ employees, records, state, employeeState, onSaved }) {
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const month = date.slice(0, 7);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const savedFor = (id) => records.filter(r => r.employeeId === id && monthKey(r.month) === month).sort((a,b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))[0];
  const rows = employees.map(employee => ({ employeeId: employee.id, employeeName: employee.name, month, statuses: attendanceStatuses(drafts[`${month}:${employee.id}`] || savedFor(employee.id)?.statuses, month) }));
  const dates = attendanceDates(month);
  const dirty = rows.some(row => drafts[`${month}:${row.employeeId}`]);
  const ready = rows.length > 0 && !state.loading && !employeeState.loading && !state.error && !employeeState.error;
  const complete = ready && !dirty && rows.every(row => savedFor(row.employeeId));
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    let saved = 0;
    try {
      for (const row of rows) {
        const result = await saveHrmsAttendance(row);
        onSaved(result);
        setDrafts(current => { const next = { ...current }; delete next[`${month}:${row.employeeId}`]; return next; });
        saved++;
      }
      setMessage(`Attendance saved for all ${saved} employees.`);
    } catch (err) { setError(`${saved} of ${rows.length} employees saved. ${getHrmsAttendanceErrorMessage(err)} Your remaining edits are retained; retry Save All.`); }
    finally { setSaving(false); }
  };
  return <section className="rounded-xl bg-white p-5 space-y-4">
    <h2 className="text-lg font-bold">Attendance Register</h2>
    <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2">Date <input className="rounded border px-3 py-2" aria-label="Attendance date" type="date" value={date} disabled={saving} onChange={e => { if(e.target.value) { setDate(e.target.value); setMessage(''); setError(''); } }} /></label>
      <Button disabled={!ready || saving} onClick={save}>{saving ? 'Saving…' : 'Save All Attendance'}</Button>
      <Button variant="secondary" disabled={!complete || saving} onClick={() => downloadAttendance(rows, month)}>Download Excel</Button>
    </div>
    <p className="text-sm text-slate-600">Selected date: {formatAttendanceDate(date)}. Save All Attendance and Download Excel include the full month, {formatAttendanceDate(dates[0])} to {formatAttendanceDate(dates.at(-1))}.</p>
    <p className="text-sm text-slate-600">P = Present · A = Absent · L = Leave · H = Half Day · O = Holiday. Half days count as 0.5 worked and 0.5 unpaid days. Save all employees to download the completed register.</p>
    <p className="text-sm text-slate-600">Excel shows days worked as numbers: Present = 1, Half Day = 0.5, Absent / Leave / Holiday = 0, with separate totals for each attendance status.</p>
    {(error || state.error || employeeState.error) && <p role="alert">{error || state.error || employeeState.error}</p>}
    {message && <p role="status">{message}</p>}
    {!ready && !state.error && !employeeState.error && <p>{state.loading || employeeState.loading ? 'Loading attendance…' : 'Add employees to record attendance.'}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm border-collapse"><thead><tr><th className="p-2 text-left">Employee</th>{dates.map(day => <th key={day} aria-current={day === date ? 'date' : undefined} className={`p-2 whitespace-nowrap ${day === date ? 'bg-blue-100 text-blue-800' : ''}`}>{formatAttendanceDate(day)}</th>)}{['P','A','L','H','O','Total','Worked','Unpaid'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
    <tbody>{rows.map(row => { const totals = attendanceTotals(row.statuses); return <tr key={row.employeeId} className="border-t"><th className="p-2 text-left whitespace-nowrap">{row.employeeName}<small className="block">{row.employeeId}</small></th>{row.statuses.map((status, i) => <td key={i} className="p-1"><select className="rounded border p-1" aria-label={`${row.employeeName}, day ${i + 1}`} value={status} disabled={!ready || saving} onChange={e => { const next = [...row.statuses]; next[i] = e.target.value; setDrafts(current => ({...current, [`${month}:${row.employeeId}`]: next})); setMessage(''); }}>{['P','A','L','H','O'].map(value => <option key={value}>{value}</option>)}</select></td>)}{['P','A','L','H','O','total','worked','unpaid'].map(key => <td key={key} className="p-2 text-center">{totals[key]}</td>)}</tr>; })}</tbody></table></div>
  </section>;
}
