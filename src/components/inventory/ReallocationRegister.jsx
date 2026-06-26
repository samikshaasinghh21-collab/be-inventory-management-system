import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DateInput from "../common/DateInput";
import { fetchLocations } from "../../services/locationsApi";
import { fetchProjects } from "../../services/projectsApi";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchReallocateInventory } from "../../services/reallocateInventoryApi";
import useSettings from "../../hooks/useSettings";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import {
  buildInventorySourceSearchText,
  buildInventorySourceSummary,
  matchesInventorySourceFilter,
} from "../../utils/inventorySource";
import DocumentViewPanel from "./DocumentViewPanel";
 
const panel =
  "rounded-xl border border-slate-200 bg-[#f8f9ff] shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
 
const qty = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
 
const fmtQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
 
const sortValue = (record = {}) => {
  const raw =
    record.updatedAt ??
    record.requestDate ??
    record.transferDate ??
    record.createdAt ??
    null;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};
 
const err = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;
 
const getMovementTypeLabel = (type) =>
  type === "Reallocate" ? "Reallocation" : type || "-";
 
const ReallocationRegister = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";
 
  const [records, setRecords] = useState([]);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [query, setQuery] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [fromLocationFilter, setFromLocationFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [viewRecord, setViewRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
 
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => sortValue(b) - sortValue(a)),
    [records]
  );
 
  const projectMap = useMemo(
    () =>
      projects.reduce((acc, project) => {
        acc[String(project.id)] = project;
        return acc;
      }, {}),
    [projects]
  );
 
  const locationMap = useMemo(
    () =>
      locations.reduce((acc, location) => {
        acc[String(location.id)] = location;
        return acc;
      }, {}),
    [locations]
  );
 
  const vendorMap = useMemo(
    () =>
      vendors.reduce((acc, vendor) => {
        acc[String(vendor.id)] = vendor;
        return acc;
      }, {}),
    [vendors]
  );
 
  const totalQty = useMemo(
    () =>
      sortedRecords.reduce(
        (sum, record) =>
          sum +
          (record.items || []).reduce((itemSum, item) => itemSum + qty(item.quantity), 0),
        0
      ),
    [sortedRecords]
  );

  const getRecordDestination = (record = {}) =>
    record.type === "Return"
      ? vendorMap[String(record.returnVendorId)]?.name || "-"
      : locationMap[String(record.toLocationId)]?.name || "-";

  const getRecordDestinationFilterValue = (record = {}) =>
    record.type === "Return"
      ? `vendor:${String(record.returnVendorId || "")}`
      : `location:${String(record.toLocationId || "")}`;

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortedRecords.filter((record) => {
      if (statusFilter !== "all" && String(record.status || "").toLowerCase() !== statusFilter) {
        return false;
      }
      if (movementTypeFilter !== "all" && String(record.type || "").toLowerCase() !== movementTypeFilter) {
        return false;
      }
      if (
        sourceTypeFilter !== "all" &&
        !(record.items || []).some((item) =>
          matchesInventorySourceFilter(item.sourceType, sourceTypeFilter)
        )
      ) {
        return false;
      }
      if (projectFilter !== "all" && String(record.projectId || "") !== projectFilter) {
        return false;
      }
      if (
        fromLocationFilter !== "all" &&
        String(record.fromLocationId || "") !== fromLocationFilter
      ) {
        return false;
      }
      if (destinationFilter !== "all" && getRecordDestinationFilterValue(record) !== destinationFilter) {
        return false;
      }
      const recordDate =
        record.requestDate || record.transferDate || record.createdAt || null;
      const recordDateValue =
        recordDate && String(recordDate).length >= 10 ? String(recordDate).slice(0, 10) : "";
      if (fromDateFilter && (!recordDateValue || recordDateValue < fromDateFilter)) {
        return false;
      }
      if (toDateFilter && (!recordDateValue || recordDateValue > toDateFilter)) {
        return false;
      }
      if (!needle) return true;
      const destination = getRecordDestination(record);
      const itemsText = (record.items || [])
        .map((item) => item.name || item.item || "")
        .filter(Boolean)
        .join(" ");
      const dateText = formatDate(
        record.requestDate || record.transferDate || record.createdAt
      );
      const safeDate = dateText === "-" ? "" : dateText;
      const sourceSummary = buildInventorySourceSummary(record.items);
      const haystack = [
        record.referenceNumber,
        record.consumptionNumber,
        record.type,
        sourceSummary,
        projectMap[String(record.projectId)]?.name,
        locationMap[String(record.fromLocationId)]?.name,
        destination,
        record.status,
        record.requestedBy,
        record.notes,
        itemsText,
        buildInventorySourceSearchText(record.items),
        safeDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [
    query,
    statusFilter,
    sortedRecords,
    destinationFilter,
    fromDateFilter,
    fromLocationFilter,
    projectMap,
    locationMap,
    movementTypeFilter,
    projectFilter,
    sourceTypeFilter,
    toDateFilter,
    vendorMap,
  ]);
 
  const activeViewRecord = useMemo(() => {
    if (!viewRecord?.id) {
      return viewRecord;
    }
    return (
      records.find((record) => String(record.id) === String(viewRecord.id)) ?? viewRecord
    );
  }, [records, viewRecord]);
 
  const loadRecords = async () => {
    const list = await fetchReallocateInventory();
    const safe = Array.isArray(list) ? list : [];
    const sorted = [...safe].sort((a, b) => sortValue(b) - sortValue(a));
    setRecords(sorted);
    return sorted;
  };
 
  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      setLoading(true);
      setErrorMessage("");
      const [pr, lr, vr, rr] = await Promise.allSettled([
        fetchProjects(),
        fetchLocations(),
        fetchVendors(),
        fetchReallocateInventory(),
      ]);
      if (!mounted) return;
      const p = pr.status === "fulfilled" && Array.isArray(pr.value) ? pr.value : [];
      const l = lr.status === "fulfilled" && Array.isArray(lr.value) ? lr.value : [];
      const v = vr.status === "fulfilled" && Array.isArray(vr.value) ? vr.value : [];
      const r = rr.status === "fulfilled" && Array.isArray(rr.value) ? rr.value : [];
      setProjects(p);
      setLocations(l);
      setVendors(v);
      setRecords([...r].sort((a, b) => sortValue(b) - sortValue(a)));
      const loadError =
        (pr.status === "rejected" ? err(pr.reason, "Failed to load projects.") : "") ||
        (lr.status === "rejected" ? err(lr.reason, "Failed to load locations.") : "") ||
        (vr.status === "rejected" ? err(vr.reason, "Failed to load vendors.") : "") ||
        (rr.status === "rejected"
          ? err(rr.reason, "Failed to load reallocations.")
          : "");
      if (loadError) setErrorMessage(loadError);
      setLoading(false);
    };
 
    const refreshOnEvent = () => {
      void (async () => {
        try {
          await loadRecords();
        } catch (loadErr) {
          setErrorMessage(err(loadErr, "Failed to refresh records."));
        }
      })();
    };
 
    void loadAll();
    if (typeof window !== "undefined") {
      window.addEventListener("reallocate-inventory:changed", refreshOnEvent);
    }
    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("reallocate-inventory:changed", refreshOnEvent);
      }
    };
  }, []);
 
  const statusClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (normalized === "in transit") return "border-blue-200 bg-blue-50 text-blue-700";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };
 
  const printRegister = () => {
    printSection({
      selector: "#reallocation-register",
      title: "Reallocation",
      subtitle: "Inventory movement ledger",
      metaRows: [
        { label: "Total Entries", value: sortedRecords.length },
        { label: "Qty Moved", value: fmtQty(totalQty) },
      ],
      logoUrl,
      brandName,
      brandDescription,
    });
  };
 
  const printRecord = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#reallocation-view-panel",
        title: "Reallocation Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };
 
  return (
    <div className="space-y-4 p-4 md:p-6">
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-blue-600 text-sm font-semibold text-white">
            D
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-800">
            Reallocation
          </h1>
        </div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
          PROJECTS / Reallocation
        </p>
      </section>
 
      <section className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <article className={panel}>
          <div className="p-4">
            <p className="text-sm text-slate-500">Total Entries</p>
            <p className="mt-1 text-4xl font-semibold text-slate-800">
              {sortedRecords.length}
            </p>
          </div>
        </article>
        <article className={panel}>
          <div className="p-4">
            <p className="text-sm text-slate-500">Qty Moved</p>
            <p className="mt-1 text-4xl font-semibold text-slate-800">
              {fmtQty(totalQty)}
            </p>
          </div>
        </article>
        <div className={`${panel} flex items-center justify-end p-4`}>
          <button
            type="button"
            onClick={() => navigate("/inventory/reallocate-return")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + New Reallocation
          </button>
        </div>
      </section>
 
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
 
      <section id="reallocation-register" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-3xl font-semibold text-slate-800">
            Reallocation
          </h2>
          <button
            type="button"
            onClick={printRegister}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            Print Reallocation
          </button>
        </div>
        <div className="grid gap-2 border-b border-slate-200 px-4 py-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, source ref, item, project, requester..."
            className={field}
          />
          <select
            value={movementTypeFilter}
            onChange={(e) => setMovementTypeFilter(e.target.value)}
            className={field}
          >
            <option value="all">All Movement Types</option>
            <option value="reallocate">Reallocation</option>
            <option value="return">Return</option>
          </select>
          <select
            value={sourceTypeFilter}
            onChange={(e) => setSourceTypeFilter(e.target.value)}
            className={field}
          >
            <option value="all">All Source Types</option>
            <option value="receive">Receive</option>
            <option value="dc">DC</option>
            <option value="consumption">Consumption</option>
            <option value="reallocation">Reallocation</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={field}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in transit">In Transit</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={field}
          >
            <option value="all">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={fromLocationFilter}
            onChange={(e) => setFromLocationFilter(e.target.value)}
            className={field}
          >
            <option value="all">All From Locations</option>
            {locations.map((location) => (
              <option key={location.id} value={String(location.id)}>
                {location.name}
              </option>
            ))}
          </select>
          <select
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value)}
            className={field}
          >
            <option value="all">All To Locations / Vendors</option>
            {locations.map((location) => (
              <option key={`location-${location.id}`} value={`location:${location.id}`}>
                To: {location.name}
              </option>
            ))}
            {vendors.map((vendor) => (
              <option key={`vendor-${vendor.id}`} value={`vendor:${vendor.id}`}>
                Vendor: {vendor.name}
              </option>
            ))}
          </select>
          <DateInput
            value={fromDateFilter}
            onChange={setFromDateFilter}
            className={field}
          />
          <DateInput
            value={toDateFilter}
            onChange={setToDateFilter}
            className={field}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#eceff8] text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[140px]">Reallocation Reference</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Type</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Source Type</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Receive Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Project</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">From</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">To / Vendor</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Date</th>
                <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Qty</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Status</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.length === 0 && (
                <tr>
                  <td colSpan="11" className="px-4 py-10 text-center text-slate-500">
                    {loading
                      ? "Loading reallocations..."
                      : "No reallocations found."}
                  </td>
                </tr>
              )}
              {visibleRecords.map((record) => {
                const totalLineQty = (record.items || []).reduce(
                  (sum, item) => sum + qty(item.quantity),
                  0
                );
                const destination = getRecordDestination(record);
                const sourceSummary = buildInventorySourceSummary(record.items);
                return (
                  <tr key={record.id} className="border-b border-slate-200 bg-white">
                    <td className="px-4 py-3 text-slate-800">
                      {record.referenceNumber || `REL-${record.id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getMovementTypeLabel(record.type)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {sourceSummary}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.consumptionNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {projectMap[String(record.projectId)]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {locationMap[String(record.fromLocationId)]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{destination}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(record.requestDate || record.transferDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {fmtQty(totalLineQty)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                          record.status
                        )}`}
                      >
                        {record.status || "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setViewRecord(record)}
                          className="text-blue-700 underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => printRecord(record)}
                          className="text-slate-700 underline"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
 
      {activeViewRecord && (
  <DocumentViewPanel
    id="reallocation-view-panel"
    title="REALLOCATION DETAILS"
    onClose={() => setViewRecord(null)}
    companyName={brandName}
    companyAddress={brandDescription}
    companyGstin={company.gstin}
    companyPhone={company.phone}
    companyEmail={company.email}
    logoUrl={logoUrl}

    /* ✅ Only E-Way Bill will show now */
    primaryPairs={[
      {
        label: "E-Way Bill",
        value: activeViewRecord.eWayBillNumber || "-",
      },
    ]}

    leftBlockTitle="SHIP FROM"
    leftBlockLines={[
      projectMap[String(activeViewRecord.projectId)]?.name || "-",
      locationMap[String(activeViewRecord.fromLocationId)]?.name || "-",
    ]}

    rightBlockTitle="SHIP TO"
    rightBlockLines={[
      activeViewRecord.type === "Return"
        ? vendorMap[String(activeViewRecord.returnVendorId)]?.name || "-"
        : locationMap[String(activeViewRecord.toLocationId)]?.name || "-",
    ]}

    tableColumns={[
      { key: "serial", label: "Sl No", widthClass: "w-16" },
      { key: "name", label: "Material" },
      { key: "unit", label: "Unit", widthClass: "w-20" },
      { key: "quantity", label: "Qty", align: "right", widthClass: "w-24" },
    ]}

    tableRows={(activeViewRecord.items || []).map((item, index) => ({
      id: item.id ?? index,
      serial: index + 1,
      name: item.name || item.item || "-",
      unit: item.unit || "PCS",
      quantity: fmtQty(item.quantity),
    }))}

    bottomLeftTitle="Notes"
    bottomLeftValue={activeViewRecord.notes || "-"}

    bottomRightTitle="Total Quantity"
    bottomRightValue={fmtQty(
      (activeViewRecord.items || []).reduce(
        (sum, item) => sum + qty(item.quantity),
        0
      )
    )}

    footerCompanyName={brandName || "Company"}
  />
)}
    </div>
  );
};
 
export default ReallocationRegister;
 
 
