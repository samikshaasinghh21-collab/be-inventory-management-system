import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import InventoryPageHeader from "../components/inventory/InventoryPageHeader";
import { Button, Card, DataTable, EmptyState } from "../components/ui";
import { generateNextToolId, getTools, setTools } from "../services/toolsStore";
import { toast } from "../utils/toast";

export default function ToolsBulkImport() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const validate = (records) => {
    const seen = new Set(getTools().map(tool => String(tool.serialNumber).trim().toLowerCase()));
    return records.map((row, index) => {
      const record = { id: index + 1, name: String(row.name || "").trim(), type: String(row.type || "").trim(), serialNumber: String(row.serialNumber || "").trim(), baseLocation: String(row.baseLocation || "").trim(), notes: String(row.notes || "").trim(), condition: "Good", status: "Available", purchaseDate: "", imageUrl: "" };
      const missing = ["name", "type", "serialNumber"].filter(key => !record[key]);
      record.issue = missing.length ? "Required: " + missing.join(", ") : seen.has(record.serialNumber.toLowerCase()) ? "Duplicate serial number" : "";
      seen.add(record.serialNumber.toLowerCase());
      return record;
    });
  };
  const readFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setRows([]); setFileName(file.name); setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file using the template columns.");
      if (file.size > 2 * 1024 * 1024) throw new Error("Use a file smaller than 2 MB.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.text(), { type: "string", raw: true });
      const records = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      if (!records.length) throw new Error("This file has no tool records.");
      if (records.length > 1000) throw new Error("Import up to 1,000 tools at a time.");
      setRows(validate(records));
    } catch (failure) { setError(failure.message || "Unable to read this CSV. Check its columns and try again."); }
    finally { setBusy(false); event.target.value = ""; }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["name,type,serialNumber,baseLocation,notes\r\n"], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "tool-import-template.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importRows = () => {
    const checked = validate(rows);
    setRows(checked);
    if (checked.some(row => row.issue)) { setError("Resolve the marked rows in your CSV and upload it again."); return; }
    try {
      const nextTools = [...getTools()];
      checked.forEach(({ issue, id, ...record }) => { void issue; void id; nextTools.push({ ...record, id: generateNextToolId(nextTools) }); });
      setTools(nextTools); toast(checked.length + " tools imported successfully."); setRows([]); setFileName(""); setError("");
    } catch { setError("Unable to save tools in this browser. Check available storage and try again."); }
  };
  const invalid = rows.filter(row => row.issue).length;
  return <div className="space-y-5"><InventoryPageHeader title="Import tools" description="Upload a CSV, review each record, and add validated tools to the register." actions={<Button variant="secondary" onClick={downloadTemplate}><Download size={16} />Download template</Button>} />
    <Card title="Upload a tool register" description="Required columns: name, type, serialNumber. Optional: baseLocation, notes.">
      <div className="inventory-upload-area"><Upload size={22} /><div><strong>Select a CSV file</strong><p>Up to 1,000 tools · maximum 2 MB · unique serial numbers</p></div><input aria-label="Upload tool CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={readFile} /></div>
      <p className="mt-3 text-xs text-slate-500">Tools are stored in this browser, using the same storage as the tool register. Existing records are preserved.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Card>
    <Card title={fileName || "Import preview"} description={rows.length ? rows.length + " rows · " + invalid + " need attention" : "Review the file before importing."} action={rows.length > 0 && <Button disabled={busy || invalid > 0} onClick={importRows}>Import {rows.length} tools</Button>}>
      {rows.length ? <DataTable rows={rows} columns={[{ key: "name", label: "Tool" }, { key: "type", label: "Type" }, { key: "serialNumber", label: "Serial number" }, { key: "baseLocation", label: "Location" }, { key: "issue", label: "Validation", render: row => <span className={row.issue ? "text-red-700" : "text-emerald-700"}>{row.issue || "Ready to import"}</span> }]} /> : <EmptyState title={busy ? "Reading your file…" : "No file selected"} description="Download the template to use the correct column names." />}
    </Card><Link className="executive-link" to="/inventory/tools">Back to tool register</Link>
  </div>;
}
