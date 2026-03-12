import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useSettings from "../../hooks/useSettings";
import { fetchBoq } from "../../services/boqApi";
import { fetchProjects } from "../../services/projectsApi";

const BoqDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";

  const [boq, setBoq] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

  const handleExportCsv = () => {
    if (!boq) return;
    setExporting(true);
    try {
      const headerLines = [
        ["BOQ Number", boq.boqNumber ?? ""],
        ["Project", projectMap[String(boq.projectId)]?.name ?? ""],
        ["Status", boq.status ?? ""],
        ["Version", boq.version ?? ""],
        ["Prepared By", boq.preparedBy ?? ""],
        ["Date", boq.date ?? ""],
        ["Notes", (boq.notes ?? "").replace(/\r?\n/g, " ")],
        [],
        [
          "Item",
          "Description",
          "Unit",
          "Planned Qty",
          "Consumed Qty",
          "Available Qty",
          "Rate",
          "Amount",
          "Notes",
        ],
      ];

      const itemLines = (boq.items ?? []).map((item) => [
        item.name ?? "",
        (item.description ?? "").replace(/\r?\n/g, " "),
        item.unit ?? "",
        item.quantity ?? "",
        item.consumedQty ?? "",
        item.availableQty ?? "",
        item.rate ?? "",
        item.amount ?? "",
        (item.notes ?? "").replace(/\r?\n/g, " "),
      ]);

      const rows = [...headerLines, ...itemLines];
      const csv = rows
        .map((cols) =>
          cols
            .map((val) => {
              const s = String(val ?? "");
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(",")
        )
        .join("\n");

      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${boq.boqNumber || "boq"}-items.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [boqRes, projRes] = await Promise.all([
          fetchBoq(id),
          fetchProjects(),
        ]);
        setBoq(boqRes);
        setProjects(projRes);
      } catch (err) {
        console.error("Failed to load BOQ", err);
        setError(err?.response?.data?.error ?? "Unable to load BOQ");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-slate-600">Loading BOQ...</p>
      </div>
    );
  }

  if (error || !boq) {
    return (
      <div className="p-6">
        <p className="text-red-600 mb-3">{error || "BOQ not found"}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  const projectName = projectMap[String(boq.projectId)]?.name || "-";
  const total = boq.items?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;

  return (
    <div id="boq-print-area" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">BOQ</p>
          <h1 className="text-3xl font-semibold text-slate-800">{boq.boqNumber}</h1>
          <p className="text-sm text-slate-500">Project: {projectName}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Print
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-500">Status</p>
          <p className="text-lg font-semibold text-slate-800">{boq.status || "-"}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-500">Version</p>
          <p className="text-lg font-semibold text-slate-800">{boq.version || "-"}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-500">Value</p>
          <p className="text-lg font-semibold text-slate-800">{formatCurrency(total)}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-lg border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Header</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-700">
          <div>
            <p className="text-slate-500">Project</p>
            <p className="font-semibold">{projectName}</p>
          </div>
          <div>
            <p className="text-slate-500">Prepared By</p>
            <p className="font-semibold">{boq.preparedBy || "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Date</p>
            <p className="font-semibold">{boq.date || "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Notes</p>
            <p className="font-semibold">{boq.notes || "-"}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h3 className="text-lg font-semibold text-slate-800">Line Items</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[200px]">Item</th>
              <th className="p-3 text-left min-w-[200px]">Description</th>
              <th className="p-3 text-left min-w-[80px]">Unit</th>
              <th className="p-3 text-left min-w-[90px]">Planned Qty</th>
              <th className="p-3 text-left min-w-[110px]">Consumed Qty</th>
              <th className="p-3 text-left min-w-[110px]">Available Qty</th>
              <th className="p-3 text-left min-w-[100px]">Rate</th>
              <th className="p-3 text-left min-w-[110px]">Amount</th>
              <th className="p-3 text-left min-w-[160px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {boq.items?.length === 0 && (
              <tr>
                <td colSpan="9" className="p-6 text-center text-slate-500">
                  No items.
                </td>
              </tr>
            )}
            {boq.items?.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3 font-medium text-slate-800">{item.name || "-"}</td>
                <td className="p-3">{item.description || "-"}</td>
                <td className="p-3">{item.unit || "-"}</td>
                <td className="p-3">{item.quantity ?? "-"}</td>
                <td className="p-3">{item.consumedQty ?? 0}</td>
                <td className="p-3">{item.availableQty ?? "-"}</td>
                <td className="p-3">{formatCurrency(item.rate)}</td>
                <td className="p-3 font-semibold">{formatCurrency(item.amount)}</td>
                <td className="p-3">{item.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end px-4 py-3 text-sm text-slate-700 border-t">
          <span className="mr-2 font-semibold text-slate-800">Total:</span>
          {formatCurrency(total)}
        </div>
      </div>
    </div>
  );
};

export default BoqDetail;
