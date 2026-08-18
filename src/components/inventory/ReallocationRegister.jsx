import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, Printer, RefreshCw } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchDeliveryChallans } from "../../services/deliveryChallanApi";
import { fetchLocations } from "../../services/locationsApi";
import { getProjects } from "../../services/projectsStore";
import { fetchReallocateInventory } from "../../services/reallocateInventoryApi";
import DocumentViewPanel from "./DocumentViewPanel";
import useSettings from "../../hooks/useSettings";
import { defaultBrandLogoUrl, resolveBrandLogo } from "../../utils/branding";
import { formatDate, parseDateValue } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { formatQuantity } from "../../utils/formatters";

const normalizeText = (value = "") => String(value).trim().toLowerCase();

const toQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isDeliveryChallanReallocation = (record = {}) =>
  normalizeText(record.referenceType).replace(/\s+/g, "_") === "delivery_challan";

const getChronologyTime = (record = {}) => {
  const date = parseDateValue(
    record.requestDate || record.transferDate || record.createdAt || record.updatedAt
  );
  return date ? date.getTime() : 0;
};

const getRecordId = (record = {}) =>
  String(record.id ?? record.transferId ?? record.referenceNumber ?? "").trim();

const getRecordTotalQuantity = (record = {}) =>
  (Array.isArray(record.items) ? record.items : []).reduce(
    (sum, item) => sum + toQuantity(item.quantity),
    0
  );

const statusTone = (status = "") => {
  switch (normalizeText(status)) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "cancelled":
    case "canceled":
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const ReallocationRegister = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stateSignatureRef = useRef("");
  const settings = useSettings();
  const company = settings?.company || {};
  const companyLogo = resolveBrandLogo(company.logo || "");
  const companyName = company.name || "Bangalore Electronics";

  const [records, setRecords] = useState([]);
  const [projects, setProjects] = useState(() => getProjects());
  const [locations, setLocations] = useState([]);
  const [challans, setChallans] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [highlightedId, setHighlightedId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [viewRecordId, setViewRecordId] = useState("");

  const loadRegister = useCallback(async () => {
    try {
      setLoading(true);
      setApiError("");
      const [reallocationsList, challansList, locationsList] = await Promise.all([
        fetchReallocateInventory(),
        fetchDeliveryChallans().catch(() => []),
        fetchLocations().catch(() => []),
      ]);
      setRecords(Array.isArray(reallocationsList) ? reallocationsList : []);
      setChallans(Array.isArray(challansList) ? challansList : []);
      setLocations(Array.isArray(locationsList) ? locationsList : []);
      setProjects(getProjects());
    } catch (error) {
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load the reallocation register."
      );
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  useEffect(() => {
    const refreshRegister = () => {
      void loadRegister();
    };
    const refreshProjects = () => {
      setProjects(getProjects());
    };

    window.addEventListener("reallocate-inventory:changed", refreshRegister);
    window.addEventListener("delivery-challans:changed", refreshRegister);
    window.addEventListener("locations:changed", refreshRegister);
    window.addEventListener("projects:changed", refreshProjects);

    return () => {
      window.removeEventListener("reallocate-inventory:changed", refreshRegister);
      window.removeEventListener("delivery-challans:changed", refreshRegister);
      window.removeEventListener("locations:changed", refreshRegister);
      window.removeEventListener("projects:changed", refreshProjects);
    };
  }, [loadRegister]);

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
      locations.reduce((acc, locationItem) => {
        acc[String(locationItem.id)] = locationItem;
        return acc;
      }, {}),
    [locations]
  );

  const challanMap = useMemo(
    () =>
      challans.reduce((acc, challan) => {
        acc[String(challan.id)] = challan;
        return acc;
      }, {}),
    [challans]
  );

  const deliveryChallanRecords = useMemo(
    () =>
      records
        .filter((record) => isDeliveryChallanReallocation(record))
        .sort((left, right) => getChronologyTime(right) - getChronologyTime(left)),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const query = normalizeText(search);
    if (!query) {
      return deliveryChallanRecords;
    }

    return deliveryChallanRecords.filter((record) => {
      const challan = challanMap[String(record.referenceId)] || {};
      const projectName = projectMap[String(record.projectId)]?.name || "";
      const fromLocationName = locationMap[String(record.fromLocationId)]?.name || "";
      const toLocationName = locationMap[String(record.toLocationId)]?.name || "";
      const haystack = [
        record.referenceNumber,
        record.referenceNo,
        record.requestedBy,
        record.notes,
        challan.dcNumber,
        projectName,
        fromLocationName,
        toLocationName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [challanMap, deliveryChallanRecords, locationMap, projectMap, search]);

  useEffect(() => {
    const highlightId = String(location.state?.highlightReallocationId ?? "").trim();
    if (!highlightId || !deliveryChallanRecords.length) {
      return;
    }

    const matchedRecord = deliveryChallanRecords.find(
      (record) => getRecordId(record) === highlightId
    );
    if (!matchedRecord) {
      return;
    }

    const signature = `${location.key}:${highlightId}`;
    if (stateSignatureRef.current === signature) {
      return;
    }
    stateSignatureRef.current = signature;

    setHighlightedId(highlightId);
    setSuccessMessage(String(location.state?.successMessage || "").trim());

    const timer = window.setTimeout(() => {
      document
        .getElementById(`reallocation-row-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [deliveryChallanRecords, location.key, location.state]);

  const handleOpenDeliveryChallanHistory = (record) => {
    const challanId = String(record.referenceId ?? "").trim();
    if (!challanId) {
      return;
    }
    navigate("/inventory/delivery-challan", {
      state: {
        openChallanId: challanId,
        openChallanTab: "history",
      },
    });
  };

  const handleOpenView = (record) => {
    setViewRecordId(getRecordId(record));
  };

  const handleCloseView = () => {
    setViewRecordId("");
  };

  const viewRecord = useMemo(
    () =>
      deliveryChallanRecords.find((record) => getRecordId(record) === viewRecordId) || null,
    [deliveryChallanRecords, viewRecordId]
  );

  const viewChallan = viewRecord
    ? challanMap[String(viewRecord.referenceId)] || {}
    : {};
  const viewProject = viewRecord ? projectMap[String(viewRecord.projectId)] || {} : {};
  const viewFromLocation = viewRecord
    ? locationMap[String(viewRecord.fromLocationId)] || {}
    : {};
  const viewToLocation = viewRecord
    ? locationMap[String(viewRecord.toLocationId)] || {}
    : {};

  const registerMetaRows = [
    [
      { label: "Total records", value: String(filteredRecords.length) },
      {
        label: "Total quantity",
        value: formatQuantity(
          filteredRecords.reduce((sum, record) => sum + getRecordTotalQuantity(record), 0)
        ),
      },
    ],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">Reallocation Register</h1>
            <p className="text-sm text-slate-500">
              Review saved delivery challan reallocations and jump back to DC history.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="reallocation-register-search">
              Search reallocation register
            </label>
            <input
              id="reallocation-register-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ref, DC, location, requester..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-80"
            />
            <button
              type="button"
              onClick={() => void loadRegister()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() =>
                printSection({
                  selector: "#reallocation-register",
                  title: "Reallocation Register",
                  subtitle: "Delivery challan reallocation trail",
                  metaRows: registerMetaRows,
                  logoUrl: resolveBrandLogo(company.logo || ""),
                  brandName: company.name || "Bangalore Electronics",
                  brandDescription: company.address || "Company address",
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>

        {successMessage ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {apiError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {apiError}
          </div>
        ) : null}
      </section>

      <section
        id="reallocation-register"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Reallocation Ref</th>
                <th className="px-4 py-3 text-left font-medium">DC Ref</th>
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">From</th>
                <th className="px-4 py-3 text-left font-medium">To</th>
                <th className="px-4 py-3 text-left font-medium">Request Date</th>
                <th className="px-4 py-3 text-left font-medium">Requested By</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-12 text-center text-sm text-slate-500">
                    {deliveryChallanRecords.length
                      ? "No reallocation records match the current search."
                      : "No delivery challan reallocations have been saved yet."}
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td colSpan="11" className="px-4 py-12 text-center text-sm text-slate-500">
                    Loading reallocation register...
                  </td>
                </tr>
              ) : null}

              {!loading
                ? filteredRecords.map((record) => {
                    const recordId = getRecordId(record);
                    const challan = challanMap[String(record.referenceId)] || {};
                    const project = projectMap[String(record.projectId)] || {};
                    const fromLocation = locationMap[String(record.fromLocationId)] || {};
                    const toLocation = locationMap[String(record.toLocationId)] || {};
                  const isHighlighted = highlightedId === recordId;

                  return (
                      <Fragment key={recordId}>
                        <tr
                          id={`reallocation-row-${recordId}`}
                          className={`border-t transition ${
                            isHighlighted ? "bg-emerald-50/70" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {record.referenceNumber || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {record.referenceNo || challan.dcNumber || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{project.name || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{fromLocation.name || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{toLocation.name || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatDate(record.requestDate || record.transferDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {record.requestedBy || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(
                                record.status
                              )}`}
                            >
                              {record.status || "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {record.items?.length || 0}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {formatQuantity(getRecordTotalQuantity(record))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => handleOpenView(record)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-slate-700"
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDeliveryChallanHistory(record)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700"
                              >
                                <ExternalLink className="h-4 w-4" />
                                View DC History
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>
      </section>

      {viewRecord ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => handleOpenDeliveryChallanHistory(viewRecord)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm"
              >
                <ExternalLink className="h-4 w-4" />
                View DC History
              </button>
            </div>
            <DocumentViewPanel
              id="reallocation-record-view"
              title="REALLOCATION REGISTER"
              onClose={handleCloseView}
              companyName={companyName}
              companyAddress={company.address || "Company address"}
              companyGstin={company.gstin}
              companyPhone={company.phone}
              companyEmail={company.email}
              logoUrl={companyLogo || defaultBrandLogoUrl}
              primaryPairs={[
                { label: "Reallocation Ref", value: viewRecord.referenceNumber || "-" },
                {
                  label: "Delivery Challan",
                  value: viewRecord.referenceNo || viewChallan.dcNumber || "-",
                },
                {
                  label: "Request Date",
                  value: formatDate(viewRecord.requestDate || viewRecord.transferDate),
                },
                { label: "Status", value: viewRecord.status || "Pending" },
                { label: "Requested By", value: viewRecord.requestedBy || "-" },
              ]}
              leftBlockTitle="From Location"
              leftBlockLines={[
                viewFromLocation.name || "-",
                viewFromLocation.address || "-",
                `Project: ${projectMap[String(viewChallan.projectId)]?.name || "-"}`,
              ]}
              rightBlockTitle="To Location"
              rightBlockLines={[
                viewToLocation.name || "-",
                viewToLocation.address || "-",
                `Project: ${viewProject.name || "-"}`,
              ]}
              tableColumns={[
                { key: "serial", label: "Sl No", widthClass: "w-16" },
                { key: "name", label: "Item" },
                { key: "description", label: "Description" },
                { key: "unit", label: "Unit", widthClass: "w-20" },
                { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
                { key: "sourceRef", label: "Source Ref", widthClass: "w-28" },
              ]}
              tableRows={(viewRecord.items || []).map((item, index) => ({
                id: item.id || item.itemId || index,
                serial: index + 1,
                name: item.name || item.item || "-",
                description: item.description || "-",
                unit: item.unit || "PCS",
                quantity: formatQuantity(item.quantity),
                sourceRef: item.sourceRef || viewRecord.referenceNo || "-",
              }))}
              bottomLeftContent={
                <div className="space-y-3 text-left">
                  <div>
                    <p className="font-semibold">Notes</p>
                    <p className="whitespace-pre-wrap text-slate-700">
                      {viewRecord.notes || "-"}
                    </p>
                  </div>
                </div>
              }
              bottomRightContent={
                <div className="space-y-3 text-right">
                  <div>
                    <p className="font-semibold">Total Items</p>
                    <p>{viewRecord.items?.length || 0}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Total Quantity</p>
                    <p>{formatQuantity(getRecordTotalQuantity(viewRecord))}</p>
                  </div>
                </div>
              }
              footerCompanyName={companyName}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ReallocationRegister;
