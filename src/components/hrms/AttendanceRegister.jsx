import { memo, useCallback, useMemo, useState } from 'react';
import Button from '../common/Button';
import { attendanceDates, attendanceStatuses, attendanceTotals, formatAttendanceDate } from '../../../shared/attendance.js';
import { monthKey } from '../../../shared/payroll.js';
import { downloadAttendance } from '../../utils/attendanceExport.js';
import { saveHrmsAttendance, emitHrmsAttendanceChange, getHrmsAttendanceErrorMessage } from '../../services/hrmsAttendanceApi';

export default function AttendanceRegister({ employees, records, state, employeeState, onSaved }) {
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const month = date.slice(0, 7);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const savedRows = useMemo(() => {
    const result = new Map();
    for (const record of records) {
      if (monthKey(record.month) !== month) continue;
      const previous = result.get(record.employeeId);
      if (!previous || String(record.savedAt || '') > String(previous.savedAt || '')) result.set(record.employeeId, record);
    }
    return result;
  }, [records, month]);
  const baseRows = useMemo(() => employees.map(employee => ({ employeeId: employee.id, employeeName: employee.name, month, statuses: attendanceStatuses(savedRows.get(employee.id)?.statuses, month) })), [employees, savedRows, month]);
  const rows = baseRows.map(row => drafts[`${month}:${row.employeeId}`] ? { ...row, statuses: drafts[`${month}:${row.employeeId}`] } : row);
  const filteredRows = rows.filter(row => `${row.employeeName} ${row.employeeId}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(currentPage * 20, (currentPage + 1) * 20);
  const dates = useMemo(() => attendanceDates(month), [month]);
  const changeStatus = useCallback((row, index, value) => {
    setDrafts(current => {
      const key = `${row.month}:${row.employeeId}`;
      const next = [...(current[key] || row.statuses)];
      next[index] = value;
      return { ...current, [key]: next };
    });
    setMessage('');
  }, []);
  const dirty = rows.some(row => drafts[`${month}:${row.employeeId}`]);
  const ready = rows.length > 0 && !state.loading && !employeeState.loading && !state.error && !employeeState.error;
  const complete = ready && !dirty && rows.every(row => savedRows.has(row.employeeId));
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    const pendingRows = rows.filter(row => drafts[`${month}:${row.employeeId}`] || !savedRows.has(row.employeeId));
    let saved = 0;
    try {
      for (const row of pendingRows) {
        const result = await saveHrmsAttendance(row, { notify: false });
        onSaved(result);
        setDrafts(current => { const next = { ...current }; delete next[`${month}:${row.employeeId}`]; return next; });
        saved++;
      }
      setMessage(`Attendance is saved for all ${rows.length} employees. ${saved} records updated.`);
    } catch (err) { setError(`${saved} of ${pendingRows.length} updates saved. ${getHrmsAttendanceErrorMessage(err)} Your remaining edits are retained; retry Save All.`); }
    finally { setSaving(false); if (saved) emitHrmsAttendanceChange(); }
  };
  return <section className="rounded-xl bg-white p-5 space-y-4">
    <h2 className="text-lg font-bold">Attendance Register</h2>
    <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2">Date <input className="rounded border px-3 py-2" aria-label="Attendance date" type="date" value={date} disabled={saving} onChange={e => { if(e.target.value) { setDate(e.target.value); setMessage(''); setError(''); } }} /></label>
      <Button disabled={!ready || saving} onClick={save}>{saving ? 'Saving…' : 'Save All Attendance'}</Button>
      <Button variant="secondary" disabled={!complete || saving} onClick={() => downloadAttendance(rows, month)}>Download Excel</Button>
    </div>
    <p className="text-sm text-slate-600">Selected date: {formatAttendanceDate(date)}. Save All Attendance and Download Excel include the full month, {formatAttendanceDate(dates[0])} to {formatAttendanceDate(dates.at(-1))}.</p>
    <p className="text-sm text-slate-600">A = Absent &middot; O = Holiday &middot; H = Half Day &middot; L = Leave &middot; P = Present</p>
    {(error || state.error || employeeState.error) && <p role="alert">{error || state.error || employeeState.error}</p>}
    {message && <p role="status">{message}</p>}
    {!ready && !state.error && !employeeState.error && <p>{state.loading || employeeState.loading ? 'Loading attendance…' : 'Add employees to record attendance.'}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <label>Find employee <input className="rounded border px-3 py-2" type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Name or employee ID" /></label>
      <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
      <span>Page {currentPage + 1} of {pageCount} ({filteredRows.length} employees)</span>
      <Button variant="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
      <span className="text-sm text-slate-600">Save and download include all employees.</span>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm border-collapse"><thead><tr><th className="p-2 text-left">Employee</th>{dates.map(day => <th key={day} aria-current={day === date ? 'date' : undefined} className={`p-2 whitespace-nowrap ${day === date ? 'bg-blue-100 text-blue-800' : ''}`}>{formatAttendanceDate(day)}</th>)}{['A','O','H','L','P','Total','Worked','Paid Days','Unpaid'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
    <tbody>{visibleRows.map(row => <AttendanceRow key={row.employeeId} employeeId={row.employeeId} employeeName={row.employeeName} month={month} statuses={row.statuses} disabled={!ready || saving} onChange={changeStatus} />)}</tbody></table></div>
  </section>;
}

const AttendanceRow = memo(function AttendanceRow({ employeeId, employeeName, month, statuses, disabled, onChange }) {
  const totals = attendanceTotals(statuses);
  return <tr className="border-t">
    <th className="p-2 text-left whitespace-nowrap">{employeeName}<small className="block">{employeeId}</small></th>
    {statuses.map((status, i) => <td key={i} className="p-1"><select className="rounded border p-1" aria-label={`${employeeName}, day ${i + 1}`} value={status} disabled={disabled} onChange={e => onChange({ employeeId, month, statuses }, i, e.target.value)}>{['A','O','H','L','P'].map(value => <option key={value}>{value}</option>)}</select></td>)}
    {['A','O','H','L','P','total','worked','paid','unpaid'].map(key => <td key={key} className="p-2 text-center">{totals[key]}</td>)}
  </tr>;
});
