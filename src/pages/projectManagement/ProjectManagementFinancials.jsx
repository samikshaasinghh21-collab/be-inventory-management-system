import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileText,
  IndianRupee,
  Plus,
  ReceiptIndianRupee,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { fetchInvoices } from "../../services/invoicesApi";
import {
  getProjectManagementProjects,
  hydrateProjectManagementProjects,
  PROJECT_MANAGEMENT_PROJECTS_EVENT,
} from "../../services/projectManagementProjectsStore";
import {
  createProjectModuleRecord,
  deleteProjectModuleRecord,
} from "../../services/projectManagementApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { formatInrCurrency } from "../../utils/formatters";

const cardClass = "rounded-xl border border-slate-200 bg-white shadow-sm";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const keyOf = (value) => String(value ?? "");
const amountOf = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};
const positiveAmount = (value) => Math.max(amountOf(value), 0);
const today = () => new Date().toISOString().slice(0, 10);

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatCompactCurrency = (value) => {
  const amount = positiveAmount(value);
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return formatInrCurrency(amount);
};

const getBudget = (project = {}) =>
  positiveAmount(project.approvedBudget) ||
  positiveAmount(project.estimatedBudget) ||
  positiveAmount(project.budget);

const isBudgetAllocation = (item = {}) => {
  const label = String(item.label || item.title || "").toLowerCase();
  const type = String(item.type || "").toLowerCase();
  const status = String(item.status || "").toLowerCase();
  return (
    item.entryKind === "Budget" ||
    type === "budget" ||
    (label.includes("budget") &&
      ["approved", "allocated", "pending"].includes(status))
  );
};

const getFinancialActual = (project = {}) => {
  const direct = positiveAmount(project.expenses);
  if (direct) return direct;
  return (project.financials || []).reduce((sum, item) => {
    if (isBudgetAllocation(item)) return sum;
    if (item.actual !== undefined && item.actual !== null) {
      return sum + positiveAmount(item.actual);
    }
    return sum + positiveAmount(item.amount);
  }, 0);
};

const getOrderAmount = (order = {}) => {
  const direct = positiveAmount(order.total ?? order.amount);
  if (direct) return direct;
  return (order.items || []).reduce(
    (sum, item) =>
      sum +
      positiveAmount(
        item.totalPrice ??
          positiveAmount(item.quantity ?? item.orderedQty) *
            positiveAmount(item.unitPrice ?? item.rate)
      ),
    0
  );
};

const getInvoiceTotal = (invoice = {}) =>
  positiveAmount(invoice.totals?.grandTotal ?? invoice.grandTotal ?? invoice.total);

const getInvoicePaid = (invoice = {}) =>
  positiveAmount(invoice.payment?.paidAmount ?? invoice.paidAmount);

const getInvoiceDue = (invoice = {}) => {
  const recordedDue = positiveAmount(
    invoice.totals?.dueAmount ?? invoice.dueAmount
  );
  return recordedDue || Math.max(getInvoiceTotal(invoice) - getInvoicePaid(invoice), 0);
};

const makeEmptyEntry = (projectId = "") => ({
  projectId: keyOf(projectId),
  category: "Materials",
  amount: "",
  date: today(),
  reference: "",
  notes: "",
});

const financialCategories = [
  "Materials",
  "Labour",
  "Transport",
  "Tools",
  "Subcontractor",
  "Travel",
  "Miscellaneous",
];

const healthTone = {
  Critical: "border-rose-200 bg-rose-50 text-rose-700",
  Watch: "border-amber-200 bg-amber-50 text-amber-700",
  Healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "No Budget": "border-slate-200 bg-slate-100 text-slate-600",
};

const MetricCard = ({ icon, label, value, helper, tone, trend }) => (
  <article className={`${cardClass} p-4`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-2 truncate text-2xl font-bold text-slate-950">{value}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          {trend === "up" && <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />}
          {trend === "down" && (
            <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" />
          )}
          {helper}
        </p>
      </div>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}
      >
        {createElement(icon, { className: "h-5 w-5" })}
      </span>
    </div>
  </article>
);

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
      healthTone[status] || healthTone["No Budget"]
    }`}
  >
    {status}
  </span>
);

const ProgressBar = ({ value, tone = "bg-indigo-500" }) => (
  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
    <div
      className={`h-full rounded-full transition-all ${tone}`}
      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
    />
  </div>
);

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const ProjectManagementFinancials = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjectManagementProjects());
  const [invoices, setInvoices] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceNotice, setSourceNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [healthFilter, setHealthFilter] = useState("All");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [entryForm, setEntryForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setSourceNotice("");
    try {
      setProjects(await hydrateProjectManagementProjects());
    } catch {
      setProjects(getProjectManagementProjects());
    }

    const [invoiceResult, purchaseResult] = await Promise.allSettled([
      fetchInvoices(),
      fetchPurchaseOrders(),
    ]);

    if (invoiceResult.status === "fulfilled") {
      setInvoices(invoiceResult.value);
    }
    if (purchaseResult.status === "fulfilled") {
      setPurchaseOrders(purchaseResult.value);
    }

    const unavailable = [
      invoiceResult.status === "rejected" ? "invoices" : "",
      purchaseResult.status === "rejected" ? "purchase orders" : "",
    ].filter(Boolean);
    if (unavailable.length) {
      setSourceNotice(
        `Live ${unavailable.join(" and ")} could not be loaded. Project financial data is still shown.`
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // Initial synchronization with project, purchasing, and invoice sources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load({ quiet: true });
    window.addEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, refresh);
    window.addEventListener("projects:changed", refresh);
    window.addEventListener("invoices:changed", refresh);
    window.addEventListener("purchase-orders:changed", refresh);
    return () => {
      window.removeEventListener(PROJECT_MANAGEMENT_PROJECTS_EVENT, refresh);
      window.removeEventListener("projects:changed", refresh);
      window.removeEventListener("invoices:changed", refresh);
      window.removeEventListener("purchase-orders:changed", refresh);
    };
  }, [load]);

  const rows = useMemo(() => {
    const apiOrdersByProject = new Map();
    purchaseOrders.forEach((order) => {
      const projectId = keyOf(order.projectId);
      if (!projectId) return;
      apiOrdersByProject.set(projectId, [
        ...(apiOrdersByProject.get(projectId) || []),
        order,
      ]);
    });

    const invoicesByProject = new Map();
    invoices.forEach((invoice) => {
      const projectId = keyOf(invoice.projectId);
      if (!projectId) return;
      invoicesByProject.set(projectId, [
        ...(invoicesByProject.get(projectId) || []),
        invoice,
      ]);
    });

    return projects.map((project) => {
      const projectId = keyOf(project.id);
      const seenOrders = new Set();
      const orders = [
        ...(apiOrdersByProject.get(projectId) || []),
        ...(project.purchases || []),
      ].filter((order) => {
        const key = keyOf(order.id || order.poNumber || order.reference);
        if (key && seenOrders.has(key)) return false;
        if (key) seenOrders.add(key);
        return true;
      });
      const projectInvoices = invoicesByProject.get(projectId) || [];
      const activeOrders = orders.filter(
        (order) => !String(order.status || "").toLowerCase().includes("cancel")
      );
      const budget = getBudget(project);
      const committed = activeOrders.reduce(
        (sum, order) => sum + getOrderAmount(order),
        0
      );
      const invoiced = projectInvoices.reduce(
        (sum, invoice) => sum + getInvoiceTotal(invoice),
        0
      );
      const paid = projectInvoices.reduce(
        (sum, invoice) => sum + getInvoicePaid(invoice),
        0
      );
      const outstanding = projectInvoices.reduce(
        (sum, invoice) => sum + getInvoiceDue(invoice),
        0
      );
      const recordedActual = getFinancialActual(project);
      const actual = Math.max(recordedActual, paid);
      const forecast = Math.max(actual, committed, invoiced);
      const variance = budget - forecast;
      const utilization = budget ? Math.round((forecast / budget) * 100) : 0;
      const overdueInvoices = projectInvoices.filter((invoice) => {
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        return (
          getInvoiceDue(invoice) > 0 &&
          dueDate &&
          !Number.isNaN(dueDate.getTime()) &&
          dueDate.getTime() < Date.now()
        );
      }).length;
      let health = "Healthy";
      if (!budget) health = "No Budget";
      else if (forecast > budget || utilization >= 95) health = "Critical";
      else if (utilization >= 80 || overdueInvoices > 0) health = "Watch";

      return {
        ...project,
        budget,
        committed,
        invoiced,
        paid,
        outstanding,
        actual,
        recordedActual,
        forecast,
        variance,
        utilization,
        overdueInvoices,
        health,
        orders,
        invoices: projectInvoices,
      };
    });
  }, [invoices, projects, purchaseOrders]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (
          query &&
          ![
            row.name,
            row.code,
            row.client,
            row.companyName,
            row.projectManager,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)
        ) {
          return false;
        }
        if (statusFilter !== "All" && row.status !== statusFilter) return false;
        if (healthFilter !== "All" && row.health !== healthFilter) return false;
        return true;
      })
      .sort((left, right) => {
        const healthOrder = { Critical: 0, Watch: 1, Healthy: 2, "No Budget": 3 };
        return (
          healthOrder[left.health] - healthOrder[right.health] ||
          right.utilization - left.utilization
        );
      });
  }, [healthFilter, rows, search, statusFilter]);

  const metrics = useMemo(
    () =>
      filteredRows.reduce(
        (summary, row) => ({
          budget: summary.budget + row.budget,
          committed: summary.committed + row.committed,
          actual: summary.actual + row.actual,
          forecast: summary.forecast + row.forecast,
          outstanding: summary.outstanding + row.outstanding,
          atRisk:
            summary.atRisk +
            (["Critical", "Watch"].includes(row.health) ? 1 : 0),
        }),
        {
          budget: 0,
          committed: 0,
          actual: 0,
          forecast: 0,
          outstanding: 0,
          atRisk: 0,
        }
      ),
    [filteredRows]
  );

  const statuses = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(),
    [rows]
  );

  const attentionRows = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.health === "Critical" ||
            row.overdueInvoices > 0 ||
            row.health === "No Budget"
        )
        .slice(0, 5),
    [rows]
  );

  const chartRows = useMemo(
    () =>
      [...filteredRows]
        .sort((left, right) => right.budget - left.budget)
        .slice(0, 6),
    [filteredRows]
  );

  const selectedRow = rows.find(
    (row) => keyOf(row.id) === keyOf(selectedProjectId)
  );

  const openEntry = (projectId = "") => {
    setFormError("");
    setEntryForm(makeEmptyEntry(projectId));
  };

  const saveEntry = async () => {
    const amount = positiveAmount(entryForm?.amount);
    if (!entryForm?.projectId) {
      setFormError("Select a project.");
      return;
    }
    if (!amount) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    const entry = {
      id: `financial-entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entryKind: "Expense",
      label: entryForm.category,
      category: entryForm.category,
      type: entryForm.category,
      amount,
      actual: amount,
      date: entryForm.date,
      reference: entryForm.reference.trim(),
      notes: entryForm.notes.trim(),
      status: "Recorded",
      createdAt: new Date().toISOString(),
    };
    try {
      await createProjectModuleRecord("financial-entries", {
        projectId: entryForm.projectId,
        data: { ...entry, id: undefined },
      });
      setProjects(await hydrateProjectManagementProjects());
      setEntryForm(null);
    } catch (saveError) {
      setFormError(
        saveError?.response?.data?.error ||
          saveError?.message ||
          "Financial entry could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (_projectId, entryId) => {
    if (!Number.isFinite(Number(entryId))) {
      setFormError("This legacy entry must be saved to SQL before it can be deleted.");
      return;
    }
    try {
      await deleteProjectModuleRecord("financial-entries", entryId);
      setProjects(await hydrateProjectManagementProjects());
    } catch (deleteError) {
      setFormError(
        deleteError?.response?.data?.error ||
          deleteError?.message ||
          "Financial entry could not be deleted."
      );
    }
  };

  const exportCsv = () => {
    const headers = [
      "Project",
      "Code",
      "Customer",
      "Status",
      "Financial Health",
      "Approved Budget",
      "Committed",
      "Actual Spend",
      "Invoiced",
      "Outstanding",
      "Forecast",
      "Variance",
      "Utilization %",
    ];
    const lines = [
      headers.map(csvCell).join(","),
      ...filteredRows.map((row) =>
        [
          row.name,
          row.code,
          row.companyName || row.client,
          row.status,
          row.health,
          row.budget,
          row.committed,
          row.actual,
          row.invoiced,
          row.outstanding,
          row.forecast,
          row.variance,
          row.utilization,
        ]
          .map(csvCell)
          .join(",")
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-financials-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const utilization = metrics.budget
    ? Math.round((metrics.forecast / metrics.budget) * 100)
    : 0;
  const portfolioVariance = metrics.budget - metrics.forecast;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
            Project Management
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950 md:text-3xl">
            Financials
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Control project budgets, commitments, actual spend, invoices, and
            forecast variance from one workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load({ quiet: true })}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => openEntry()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Financial Entry
          </button>
        </div>
      </section>

      {sourceNotice && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{sourceNotice}</p>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={WalletCards}
          label="Approved Budget"
          value={formatCompactCurrency(metrics.budget)}
          helper={`${filteredRows.length} projects in view`}
          tone="bg-indigo-50 text-indigo-600"
        />
        <MetricCard
          icon={ShoppingCart}
          label="Committed"
          value={formatCompactCurrency(metrics.committed)}
          helper="Active purchase commitments"
          tone="bg-violet-50 text-violet-600"
        />
        <MetricCard
          icon={Banknote}
          label="Actual Spend"
          value={formatCompactCurrency(metrics.actual)}
          helper="Recorded expenses or paid invoices"
          tone="bg-blue-50 text-blue-600"
        />
        <MetricCard
          icon={TrendingUp}
          label="Forecast"
          value={formatCompactCurrency(metrics.forecast)}
          helper={`${utilization}% portfolio utilization`}
          tone="bg-cyan-50 text-cyan-600"
          trend={utilization >= 90 ? "up" : undefined}
        />
        <MetricCard
          icon={ReceiptIndianRupee}
          label="Outstanding"
          value={formatCompactCurrency(metrics.outstanding)}
          helper="Unpaid invoice balance"
          tone="bg-amber-50 text-amber-600"
        />
        <MetricCard
          icon={portfolioVariance < 0 ? AlertTriangle : CheckCircle2}
          label="Forecast Variance"
          value={formatCompactCurrency(Math.abs(portfolioVariance))}
          helper={portfolioVariance < 0 ? "Over approved budget" : "Budget headroom"}
          tone={
            portfolioVariance < 0
              ? "bg-rose-50 text-rose-600"
              : "bg-emerald-50 text-emerald-600"
          }
          trend={portfolioVariance < 0 ? "up" : "down"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
        <article className={`${cardClass} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                Budget vs forecast
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Largest project budgets in the current view.
              </p>
            </div>
            <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-200" />
                Budget
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                Forecast
              </span>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {chartRows.length ? (
              chartRows.map((row) => {
                const scale = Math.max(row.budget, row.forecast, 1);
                return (
                  <button
                    type="button"
                    key={row.id}
                    onClick={() => setSelectedProjectId(keyOf(row.id))}
                    className="grid w-full gap-2 text-left sm:grid-cols-[160px_minmax(0,1fr)_95px] sm:items-center"
                  >
                    <span className="truncate text-sm font-medium text-slate-700">
                      {row.name || row.code}
                    </span>
                    <span className="relative block h-7 overflow-hidden rounded-md bg-slate-50">
                      <span
                        className="absolute inset-y-0 left-0 rounded-md bg-indigo-100"
                        style={{ width: `${(row.budget / scale) * 100}%` }}
                      />
                      <span
                        className={`absolute left-0 top-2 h-3 rounded-r ${
                          row.forecast > row.budget
                            ? "bg-rose-500"
                            : "bg-indigo-600"
                        }`}
                        style={{ width: `${(row.forecast / scale) * 100}%` }}
                      />
                    </span>
                    <span
                      className={`text-right text-xs font-semibold ${
                        row.variance < 0 ? "text-rose-600" : "text-slate-600"
                      }`}
                    >
                      {formatCompactCurrency(row.forecast)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="grid min-h-44 place-items-center text-sm text-slate-500">
                No project budgets match the filters.
              </div>
            )}
          </div>
        </article>

        <article className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Needs attention
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Budget and payment exceptions.
                </p>
              </div>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600">
                {metrics.atRisk}
              </span>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {attentionRows.length ? (
              attentionRows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => setSelectedProjectId(keyOf(row.id))}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      row.health === "Critical"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {row.health === "No Budget" ? (
                      <IndianRupee className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {row.name || row.code}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {row.health === "No Budget"
                        ? "Approved budget is missing"
                        : row.overdueInvoices
                          ? `${row.overdueInvoices} overdue invoice${row.overdueInvoices === 1 ? "" : "s"}`
                          : `${row.utilization}% forecast utilization`}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  No critical exceptions
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Project finances are within configured limits.
                </p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Project financial control
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Forecast, invoice, and variance position by project.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:w-[720px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search project or customer"
                  className={`${inputClass} pl-9`}
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={inputClass}
              >
                <option value="All">All project statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                value={healthFilter}
                onChange={(event) => setHealthFilter(event.target.value)}
                className={inputClass}
              >
                <option value="All">All financial health</option>
                {["Healthy", "Watch", "Critical", "No Budget"].map((health) => (
                  <option key={health} value={health}>
                    {health}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Project</th>
                <th className="px-4 py-3 text-left font-semibold">Health</th>
                <th className="px-4 py-3 text-right font-semibold">Budget</th>
                <th className="px-4 py-3 text-right font-semibold">Committed</th>
                <th className="px-4 py-3 text-right font-semibold">Actual</th>
                <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                <th className="px-4 py-3 text-right font-semibold">Forecast</th>
                <th className="px-4 py-3 text-right font-semibold">Variance</th>
                <th className="px-4 py-3 text-left font-semibold">Utilization</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="10" className="px-4 py-16 text-center text-slate-500">
                    Loading project financials…
                  </td>
                </tr>
              ) : filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedProjectId(keyOf(row.id))}
                        className="text-left"
                      >
                        <span className="block font-semibold text-slate-900">
                          {row.name || "Untitled project"}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {[row.code, row.companyName || row.client]
                            .filter(Boolean)
                            .join(" · ") || "No customer"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={row.health} />
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-900">
                      {formatInrCurrency(row.budget)}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-700">
                      {formatInrCurrency(row.committed)}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-700">
                      {formatInrCurrency(row.actual)}
                    </td>
                    <td className="px-4 py-4 text-right text-amber-700">
                      {formatInrCurrency(row.outstanding)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-900">
                      {formatInrCurrency(row.forecast)}
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-semibold ${
                        row.variance < 0 ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {row.variance < 0 ? "−" : "+"}
                      {formatInrCurrency(Math.abs(row.variance))}
                    </td>
                    <td className="px-4 py-4">
                      <div className="w-28">
                        <div className="mb-1.5 flex justify-between text-xs">
                          <span className="text-slate-500">Forecast</span>
                          <span
                            className={
                              row.utilization >= 95
                                ? "font-semibold text-rose-600"
                                : "font-semibold text-slate-700"
                            }
                          >
                            {row.utilization}%
                          </span>
                        </div>
                        <ProgressBar
                          value={row.utilization}
                          tone={
                            row.utilization >= 95
                              ? "bg-rose-500"
                              : row.utilization >= 80
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedProjectId(keyOf(row.id))}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                      >
                        Review
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="px-4 py-16 text-center">
                    <CircleDollarSign className="mx-auto h-9 w-9 text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">
                      No matching projects
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Adjust the search or financial-health filter.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <button
            type="button"
            aria-label="Close financial detail"
            className="absolute inset-0"
            onClick={() => setSelectedProjectId("")}
          />
          <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  Financial review
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  {selectedRow.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedRow.health} />
                  <span className="text-xs text-slate-500">
                    {selectedRow.code || "No project code"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProjectId("")}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Approved Budget", selectedRow.budget],
                  ["Committed", selectedRow.committed],
                  ["Recorded Actual", selectedRow.actual],
                  ["Invoiced", selectedRow.invoiced],
                  ["Outstanding", selectedRow.outstanding],
                  ["Forecast Variance", selectedRow.variance],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p
                      className={`mt-1 text-base font-bold ${
                        label === "Forecast Variance" && value < 0
                          ? "text-rose-600"
                          : "text-slate-900"
                      }`}
                    >
                      {label === "Forecast Variance" && value < 0 ? "−" : ""}
                      {formatInrCurrency(Math.abs(value))}
                    </p>
                  </div>
                ))}
              </section>

              <section className={`${cardClass} p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Forecast utilization
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Highest of recorded spend, commitments, or invoiced value.
                    </p>
                  </div>
                  <span className="text-lg font-bold text-slate-900">
                    {selectedRow.utilization}%
                  </span>
                </div>
                <div className="mt-4">
                  <ProgressBar
                    value={selectedRow.utilization}
                    tone={
                      selectedRow.utilization >= 95
                        ? "bg-rose-500"
                        : selectedRow.utilization >= 80
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }
                  />
                </div>
              </section>

              <section className={cardClass}>
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      <ShoppingCart className="h-4 w-4 text-violet-500" />
                      Purchase commitments
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedRow.orders.length} linked orders
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/project-management/purchase-tracking")}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Open tracking
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedRow.orders.length ? (
                    selectedRow.orders.slice(0, 5).map((order, index) => (
                      <div
                        key={order.id || order.poNumber || index}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {order.poNumber || order.reference || `Order ${index + 1}`}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {[order.vendor || order.vendorName, order.status]
                              .filter(Boolean)
                              .join(" · ") || "Purchase commitment"}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-slate-800">
                          {formatInrCurrency(getOrderAmount(order))}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="p-5 text-center text-sm text-slate-500">
                      No linked purchase commitments.
                    </p>
                  )}
                </div>
              </section>

              <section className={cardClass}>
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      <FileText className="h-4 w-4 text-blue-500" />
                      Invoices
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedRow.invoices.length} linked invoices
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/inventory/invoices")}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Open register
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedRow.invoices.length ? (
                    selectedRow.invoices.slice(0, 5).map((invoice, index) => (
                      <div
                        key={invoice.id || invoice.invoiceNumber || index}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {invoice.invoiceNumber || `Invoice ${index + 1}`}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDate(invoice.dueDate)} ·{" "}
                            {invoice.payment?.status || invoice.status || "Unpaid"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-800">
                            {formatInrCurrency(getInvoiceTotal(invoice))}
                          </p>
                          {getInvoiceDue(invoice) > 0 && (
                            <p className="mt-0.5 text-xs font-medium text-amber-600">
                              Due {formatInrCurrency(getInvoiceDue(invoice))}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-5 text-center text-sm text-slate-500">
                      No project-linked invoices.
                    </p>
                  )}
                </div>
              </section>

              <section className={cardClass}>
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      <ReceiptIndianRupee className="h-4 w-4 text-emerald-500" />
                      Manual expense entries
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Adjustments recorded from this workspace.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEntry(selectedRow.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {(selectedRow.financials || []).filter(
                    (entry) => entry.entryKind === "Expense"
                  ).length ? (
                    (selectedRow.financials || [])
                      .filter((entry) => entry.entryKind === "Expense")
                      .slice(0, 8)
                      .map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-3 p-4"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">
                              {entry.category || entry.label || "Expense"}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {[formatDate(entry.date), entry.reference, entry.notes]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                              {formatInrCurrency(entry.amount)}
                            </span>
                            <button
                              type="button"
                              aria-label="Delete expense entry"
                              onClick={() => deleteEntry(selectedRow.id, entry.id)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="p-5 text-center text-sm text-slate-500">
                      No manual expenses have been recorded.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}

      {entryForm && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4">
          <button
            type="button"
            aria-label="Close financial entry form"
            className="absolute inset-0"
            onClick={() => setEntryForm(null)}
          />
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  Financial entry
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Record project expense
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add a non-invoice cost to the project actuals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEntryForm(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Project *
                </span>
                <select
                  value={entryForm.projectId}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      projectId: event.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={keyOf(project.id)}>
                      {project.name || project.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Cost category *
                </span>
                <select
                  value={entryForm.category}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  {financialCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Amount *
                </span>
                <div className="relative">
                  <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entryForm.amount}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Entry date *
                </span>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Reference
                </span>
                <input
                  value={entryForm.reference}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  placeholder="Voucher, bill, or claim number"
                  className={inputClass}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Notes
                </span>
                <textarea
                  rows="3"
                  value={entryForm.notes}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Describe the cost and why it was incurred"
                  className={inputClass}
                />
              </label>
              {formError && (
                <p className="sm:col-span-2 text-sm font-medium text-rose-600">
                  {formError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
              <button
                type="button"
                onClick={() => setEntryForm(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEntry}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManagementFinancials;
