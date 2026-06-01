import { useEffect, useMemo, useState } from "react";
import { fetchBoqs } from "../../services/boqApi";
import { fetchConsumptions } from "../../services/consumptionApi";
import { fetchDeliveryChallans } from "../../services/deliveryChallanApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchProjects } from "../../services/projectsApi";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";
import { getProjects } from "../../services/projectsStore";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import useSettings from "../../hooks/useSettings";
import { resolveBrandLogo } from "../../utils/branding";
import { printSection } from "../../utils/printUtils";
import { formatDateTimeDDMMYYYY } from "../../utils/dateFormat";
import { fetchVendors } from "../../services/vendorsApi";
import ReportFilters from "./reports/ReportFilters";
import ReportTable from "./reports/ReportTable";
import WorkflowSummary from "./reports/WorkflowSummary";
import AppIcon from "../layout/AppIcon";
import {
  REPORT_ACTIVITY_TYPES,
  buildExcelRows,
  buildReportRows,
  buildWorkflowStages,
  formatReportDate,
  getUniqueStatuses,
  isRowWithinDateRange,
} from "./reports/reportUtils";

const createDefaultFilters = (projectId = "") => ({
  projectId: projectId ? String(projectId) : "",
  fromDate: "",
  toDate: "",
  types: REPORT_ACTIVITY_TYPES.map((activity) => activity.key),
  vendorId: "",
  productQuery: "",
  status: "",
});

const SOURCE_LABELS = [
  { key: "projects", label: "Projects", load: fetchProjects },
  { key: "vendors", label: "Vendors", load: fetchVendors },
  { key: "locations", label: "Locations", load: fetchLocations },
  { key: "boqs", label: "BOQ", load: fetchBoqs },
  { key: "purchaseOrders", label: "Purchase Orders", load: fetchPurchaseOrders },
  { key: "receiveGoods", label: "Receive Goods", load: fetchReceiveGoods },
  { key: "deliveryChallans", label: "Delivery Challan", load: fetchDeliveryChallans },
  { key: "consumptions", label: "Consumption", load: fetchConsumptions },
];

const ReportsPage = () => {
  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || "");
  const companyName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

  const [records, setRecords] = useState({
    projects: [],
    vendors: [],
    locations: [],
    boqs: [],
    purchaseOrders: [],
    receiveGoods: [],
    deliveryChallans: [],
    consumptions: [],
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filterError, setFilterError] = useState("");
  const [draftFilters, setDraftFilters] = useState(() =>
    createDefaultFilters(getActiveProjectId())
  );
  const [appliedFilters, setAppliedFilters] = useState(() =>
    createDefaultFilters(getActiveProjectId())
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const loadReportData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    const settled = await Promise.allSettled(
      SOURCE_LABELS.map((source) => source.load())
    );

    const nextRecords = {};
    const failedLabels = [];

    SOURCE_LABELS.forEach((source, index) => {
      const result = settled[index];
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        nextRecords[source.key] = result.value;
      } else if (source.key === "projects") {
        nextRecords[source.key] = getProjects();
      } else {
        nextRecords[source.key] = [];
      }

      if (result.status === "rejected") {
        failedLabels.push(source.label);
      }
    });

    setRecords(nextRecords);
    setErrorMessage(
      failedLabels.length
        ? `Some live sources could not be loaded: ${failedLabels.join(", ")}.`
        : ""
    );
    setLastUpdatedAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    void loadReportData();
  }, []);

  useEffect(() => {
    const refreshOnEvent = () => {
      void loadReportData({ silent: true });
    };

    const refreshOnVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadReportData({ silent: true });
      }
    };

    const eventNames = [
      "boqs:changed",
      "purchase-orders:changed",
      "receive-goods:changed",
      "delivery-challans:changed",
      "consumptions:changed",
      "projects:changed",
      "vendors:changed",
      "locations:changed",
      "settings:changed",
    ];

    eventNames.forEach((eventName) => window.addEventListener(eventName, refreshOnEvent));
    window.addEventListener("focus", refreshOnEvent);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      eventNames.forEach((eventName) =>
        window.removeEventListener(eventName, refreshOnEvent)
      );
      window.removeEventListener("focus", refreshOnEvent);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  useEffect(() => {
    if (!records.projects.length) {
      return;
    }
    const activeProjectId = getActiveProjectId();
    const fallbackProjectId =
      records.projects.find((project) => String(project.id) === String(activeProjectId))?.id ??
      records.projects[0]?.id ??
      "";

    setDraftFilters((prev) =>
      prev.projectId
        ? prev
        : {
            ...prev,
            projectId: fallbackProjectId ? String(fallbackProjectId) : "",
          }
    );
    setAppliedFilters((prev) =>
      prev.projectId
        ? prev
        : {
            ...prev,
            projectId: fallbackProjectId ? String(fallbackProjectId) : "",
          }
    );
  }, [records.projects]);

  const allRows = useMemo(
    () =>
      buildReportRows({
        ...records,
      }),
    [records]
  );

  const statuses = useMemo(() => getUniqueStatuses(allRows), [allRows]);

  const filteredRows = useMemo(() => {
    const selectedTypes = new Set(appliedFilters.types || []);
    const productNeedle = appliedFilters.productQuery.trim().toLowerCase();
    const statusNeedle = appliedFilters.status.trim().toLowerCase();

    if (!appliedFilters.projectId) {
      return [];
    }

    return allRows.filter((row) => {
      if (String(row.projectId) !== String(appliedFilters.projectId)) {
        return false;
      }
      if (!selectedTypes.has(row.activityKey)) {
        return false;
      }
      if (
        appliedFilters.vendorId &&
        String(row.vendorId) !== String(appliedFilters.vendorId)
      ) {
        return false;
      }
      if (
        productNeedle &&
        !String(row.product || "").toLowerCase().includes(productNeedle)
      ) {
        return false;
      }
      if (
        statusNeedle &&
        String(row.status || "").trim().toLowerCase() !== statusNeedle
      ) {
        return false;
      }
      if (
        !isRowWithinDateRange(row, appliedFilters.fromDate, appliedFilters.toDate)
      ) {
        return false;
      }
      return true;
    });
  }, [allRows, appliedFilters]);

  const selectedProject = useMemo(
    () =>
      records.projects.find(
        (project) => String(project.id) === String(appliedFilters.projectId)
      ) ?? null,
    [records.projects, appliedFilters.projectId]
  );

  const workflowStages = useMemo(
    () => buildWorkflowStages(filteredRows, appliedFilters.types || []),
    [filteredRows, appliedFilters.types]
  );

  const totalQuantity = useMemo(
    () => filteredRows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    [filteredRows]
  );

  const totalReceivedQuantity = useMemo(
    () =>
      filteredRows.reduce(
        (sum, row) => sum + Number(row.receivedQty ?? 0),
          0
      ),
    [filteredRows]
  );

  const totalAvailableQuantity = useMemo(
    () =>
      filteredRows.reduce(
        (sum, row) => sum + Number(row.availableQty ?? 0),
        0
      ),
    [filteredRows]
  );

  const totalBalanceQuantity = useMemo(
    () =>
      filteredRows.reduce(
        (sum, row) => sum + Number(row.balanceQty ?? 0),
        0
      ),
    [filteredRows]
  );

  const latestRow = filteredRows[filteredRows.length - 1] ?? null;

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) {
      return "Sync pending";
    }
    return formatDateTimeDDMMYYYY(lastUpdatedAt);
  }, [lastUpdatedAt]);

  const handleFilterFieldChange = (field, value) => {
    setDraftFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleToggleType = (activityKey) => {
    setDraftFilters((prev) => {
      const current = new Set(prev.types || []);
      if (current.has(activityKey) && current.size === 1) {
        return prev;
      }
      if (current.has(activityKey)) {
        current.delete(activityKey);
      } else {
        current.add(activityKey);
      }
      return {
        ...prev,
        types: REPORT_ACTIVITY_TYPES.filter((activity) => current.has(activity.key)).map(
          (activity) => activity.key
        ),
      };
    });
  };

  const handleApplyFilters = () => {
    if (!draftFilters.projectId) {
      setFilterError("Select a project to generate the report.");
      return;
    }
    if (
      draftFilters.fromDate &&
      draftFilters.toDate &&
      draftFilters.fromDate > draftFilters.toDate
    ) {
      setFilterError("From Date cannot be later than To Date.");
      return;
    }
    if (!(draftFilters.types || []).length) {
      setFilterError("Select at least one activity type.");
      return;
    }
    setFilterError("");
    setActiveProjectId(draftFilters.projectId);
    setAppliedFilters({
      ...draftFilters,
      projectId: String(draftFilters.projectId),
    });
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    const nextProjectId = draftFilters.projectId || appliedFilters.projectId || getActiveProjectId();
    const normalized = createDefaultFilters(nextProjectId);
    setActiveProjectId(normalized.projectId);
    setDraftFilters(normalized);
    setAppliedFilters(normalized);
    setFilterError("");
    setCurrentPage(1);
  };

  const handleExportExcel = async () => {
    if (!filteredRows.length || isExportingExcel) {
      return;
    }
    setIsExportingExcel(true);
    try {
      const xlsxModule = await import("xlsx");
      const XLSX = xlsxModule?.default ?? xlsxModule;
      const worksheet = XLSX.utils.json_to_sheet(buildExcelRows(filteredRows));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
      const fileSafeProject =
        selectedProject?.name?.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
        "project-report";
      XLSX.writeFile(
        workbook,
        `${fileSafeProject}-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    printSection({
      selector: "#inventory-project-report",
      title: "Report",
      subtitle: "View all inventory activities under a project",
      metaRows: [
        { label: "Project", value: selectedProject?.name || "-" },
        { label: "Activities", value: filteredRows.length },
        { label: "Total Qty", value: totalQuantity.toLocaleString("en-IN") },
        {
          label: "Received Qty",
          value: totalReceivedQuantity.toLocaleString("en-IN"),
        },
        {
          label: "Available Qty",
          value: totalAvailableQuantity.toLocaleString("en-IN"),
        },
        {
          label: "Balance Qty",
          value: totalBalanceQuantity.toLocaleString("en-IN"),
        },
      ],
      logoUrl: companyLogo,
      brandName: companyName,
      brandDescription,
    });
  };

  const summaryCards = [
    {
      id: "activities",
      label: "Total Activities",
      value: filteredRows.length.toLocaleString("en-IN"),
      hint: "Filtered live records",
      tone: "bg-blue-50 text-blue-700 border-blue-100",
    },
    {
      id: "quantity",
      label: "Total Quantity",
      value: totalQuantity.toLocaleString("en-IN"),
      hint: "Movement quantity across selected workflow steps",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
    {
      id: "received",
      label: "Received Quantity",
      value: totalReceivedQuantity.toLocaleString("en-IN"),
      hint: "Quantity received against the filtered records",
      tone: "bg-amber-50 text-amber-700 border-amber-100",
    },
    {
      id: "available",
      label: "Available Quantity",
      value: totalAvailableQuantity.toLocaleString("en-IN"),
      hint: "Open or currently available quantity in the filtered result",
      tone: "bg-violet-50 text-violet-700 border-violet-100",
    },
    {
      id: "balance",
      label: "Balance Quantity",
      value: totalBalanceQuantity.toLocaleString("en-IN"),
      hint: "Balance quantity carried through the filtered workflow",
      tone: "bg-rose-50 text-rose-700 border-rose-100",
    },
    {
      id: "latest",
      label: "Latest Activity",
      value: latestRow ? latestRow.activityLabel : "No activity",
      hint: latestRow ? formatReportDate(latestRow.date) : "Waiting for records",
      tone: "bg-slate-100 text-slate-700 border-slate-200",
    },
  ];

  return (
    <div id="inventory-project-report" className="reports-page space-y-5 p-4 md:p-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Inventory Management / Reports
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">
              Inventory Reports
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              View all live inventory activities under a project across BOQ, purchase
              orders, receive goods, delivery challan, and consumption.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Synced {lastUpdatedLabel}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!filteredRows.length || isExportingExcel}
              className="app-btn app-btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppIcon name="download" className="h-4 w-4" />
              {isExportingExcel ? "Exporting..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!filteredRows.length}
              className="app-btn app-btn-outline text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppIcon name="file" className="h-4 w-4" />
              Export PDF
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorMessage}
        </div>
      ) : null}

      {filterError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {filterError}
        </div>
      ) : null}

      <ReportFilters
        projects={records.projects}
        vendors={records.vendors}
        statuses={statuses}
        filters={draftFilters}
        onFieldChange={handleFilterFieldChange}
        onToggleType={handleToggleType}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        disabled={loading && !records.projects.length}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {summaryCards.map((card) => (
          <article
            key={card.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">
                  {card.value}
                </p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{card.hint}</p>
              </div>
              <span className={`rounded-2xl border px-3 py-1.5 text-xs font-semibold ${card.tone}`}>
                Live
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <WorkflowSummary
          projectName={selectedProject?.name || ""}
          stages={workflowStages}
          totalActivities={filteredRows.length}
          totalQuantity={totalQuantity}
        />
        <ReportTable
          rows={filteredRows}
          loading={loading}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
};

export default ReportsPage;
