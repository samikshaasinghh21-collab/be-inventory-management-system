import { formatQuantity } from "../../../utils/formatters";

const sourceLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "dc") return "Delivery Challan";
  if (normalized === "receive") return "Goods Receipt";
  if (normalized === "reallocation") return "Reallocation";
  if (normalized === "consumption") return "Consumption Balance";
  return value || "Inventory";
};

const FinalInventoryTable = ({ rows = [], loading = false, error = "" }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
          Final Available Inventory
        </h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">
          Live SQL transaction balance after receipts, delivery challans, moves,
          reallocations, and consumption.
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Project, product, location tag, and location filters apply here. Date,
          activity, vendor, and status filters apply only to the activity history.
        </p>
      </div>
      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
        Transaction derived
      </span>
    </div>

    {error ? (
      <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
        {error}
      </div>
    ) : null}

    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] table-auto text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="min-w-[130px] px-4 py-3 text-left font-semibold">Location Tag</th>
            <th className="min-w-[180px] px-4 py-3 text-left font-semibold">Location</th>
            <th className="min-w-[220px] px-4 py-3 text-left font-semibold">Product</th>
            <th className="min-w-[160px] px-4 py-3 text-left font-semibold">Source</th>
            <th className="min-w-[160px] px-4 py-3 text-left font-semibold">Reference</th>
            <th className="min-w-[110px] px-4 py-3 text-right font-semibold">Received / In</th>
            <th className="min-w-[110px] px-4 py-3 text-right font-semibold">Consumed</th>
            <th className="min-w-[110px] px-4 py-3 text-right font-semibold">Moved Out</th>
            <th className="min-w-[130px] px-4 py-3 text-right font-semibold">Final Available</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan="9" className="px-4 py-10 text-center text-slate-500">Calculating the latest transaction balances...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan="9" className="px-4 py-10 text-center text-slate-500">No available inventory matches the selected project and inventory filters.</td></tr>
          ) : rows.map((row) => (
            <tr key={`${row.locationId}-${row.sourceKey}-${row.itemId ?? row.name}`} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-medium text-slate-700">{row.locationTag || "-"}</td>
              <td className="px-4 py-3 text-slate-700">{row.locationName || "-"}</td>
              <td className="px-4 py-3"><p className="font-semibold text-slate-900">{row.name || "-"}</p><p className="mt-0.5 text-xs text-slate-500">{row.itemCode || row.hsn || "No item code"} / {row.unit || "PCS"}</p></td>
              <td className="px-4 py-3 text-slate-700">{sourceLabel(row.sourceType)}</td>
              <td className="px-4 py-3 text-slate-700">{row.sourceRef || "-"}</td>
              <td className="px-4 py-3 text-right font-medium text-slate-800">{formatQuantity(row.sourceQty)}</td>
              <td className="px-4 py-3 text-right font-medium text-rose-700">{formatQuantity(row.consumedQty)}</td>
              <td className="px-4 py-3 text-right font-medium text-amber-700">{formatQuantity(row.reallocatedQty)}</td>
              <td className="px-4 py-3 text-right"><span className="inline-flex min-w-[78px] justify-end rounded-lg bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-700">{formatQuantity(row.availableQty)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
      {rows.length} stock source row{rows.length === 1 ? "" : "s"}; fully depleted rows are excluded.
    </div>
  </section>
);

export default FinalInventoryTable;
