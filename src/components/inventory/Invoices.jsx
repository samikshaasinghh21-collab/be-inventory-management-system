import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, FilePlus2, RefreshCw, Search, Trash2 } from "lucide-react";
import { deleteInvoice, fetchInvoices } from "../../services/invoicesApi";
import { formatInrCurrency } from "../../utils/formatters";
import { parseDateValue } from "../../utils/dateFormat";

const formatDate = (value) => {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "-";
  }
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${date.getFullYear()}`;
};

const statusClassName = (status) => {
  if (status === "Approved") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (status === "Submitted") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "Rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError("");
      const list = await fetchInvoices();
      setInvoices(Array.isArray(list) ? list : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.error || loadError?.message || "Failed to load invoices.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
  }, []);

  useEffect(() => {
    const refresh = () => {
      void loadInvoices();
    };
    window.addEventListener("invoices:changed", refresh);
    return () => {
      window.removeEventListener("invoices:changed", refresh);
    };
  }, []);

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return invoices;
    }
    return invoices.filter((invoice) =>
      [
        invoice.invoiceNumber,
        invoice.status,
        invoice.supplier?.name,
        invoice.buyer?.companyName,
        invoice.poReference,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [invoices, searchQuery]);

  const summary = useMemo(
    () =>
      invoices.reduce(
        (acc, invoice) => {
          acc.total += 1;
          acc.value += Number(invoice.totals?.grandTotal ?? 0) || 0;
          acc.paid += Number(invoice.payment?.paidAmount ?? 0) || 0;
          if (invoice.status === "Draft") {
            acc.draft += 1;
          }
          if (invoice.status === "Submitted") {
            acc.submitted += 1;
          }
          if (invoice.status === "Approved") {
            acc.approved += 1;
          }
          return acc;
        },
        { total: 0, value: 0, paid: 0, draft: 0, submitted: 0, approved: 0 }
      ),
    [invoices]
  );

  const handleDelete = async (invoiceId) => {
    try {
      await deleteInvoice(invoiceId);
      await loadInvoices();
    } catch (deleteError) {
      setError(
        deleteError?.response?.data?.error || deleteError?.message || "Failed to delete invoice."
      );
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Billing</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Invoice Register</h1>
          <p className="mt-2 text-sm text-slate-500">
            Review saved invoices, reopen drafts, and track approval progress.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadInvoices()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            to="/inventory/invoice"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <FilePlus2 className="h-4 w-4" />
            New Invoice
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total Invoices</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.total}</p>
          <p className="mt-1 text-xs text-slate-500">
            Draft {summary.draft} • Submitted {summary.submitted}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total Value</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {formatInrCurrency(summary.value)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Paid {formatInrCurrency(summary.paid)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Approved</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.approved}</p>
          <p className="mt-1 text-xs text-slate-500">Ready for finance follow-up</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Search invoice, vendor, buyer, or PO"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Buyer</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    Loading saved invoices...
                  </td>
                </tr>
              ) : filteredInvoices.length ? (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.invoiceId} className="border-t border-slate-100">
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{invoice.invoiceNumber}</div>
                      <div className="text-xs text-slate-500">{invoice.poReference || "-"}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{invoice.supplier?.name || "-"}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {invoice.buyer?.companyName || "-"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName(
                          invoice.status
                        )}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {formatInrCurrency(invoice.totals?.grandTotal ?? 0)}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{formatDate(invoice.invoiceDate)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/inventory/invoice?invoiceId=${invoice.invoiceId}&receiptId=${invoice.receiveGoodsId || ""}`)
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                        >
                          <Eye className="h-4 w-4" />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(invoice.invoiceId)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No invoices created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Invoices;
