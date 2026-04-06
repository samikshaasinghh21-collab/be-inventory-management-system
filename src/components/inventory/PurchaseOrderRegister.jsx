import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects } from "../../services/projectsStore";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchLocations } from "../../services/locationsApi";
import {
  fetchPurchaseOrders,
  deletePurchaseOrder,
} from "../../services/purchaseOrdersApi";
import useSettings from "../../hooks/useSettings";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";
import { buildGstSummary } from "../../utils/taxUtils";
import { isClosedPurchaseOrder } from "../../utils/purchaseOrderStatus";
import { getGstTaxMode } from "../../utils/gstUtils";
import PasswordPromptModal from "../common/PasswordPromptModal";
import { getClosedPoAuthError } from "../../utils/closedPoAuth";

const GstSummaryBlock = ({ summary, formatCurrency, align = "left" }) => {
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <div className={`space-y-1 text-sm text-slate-700 ${alignClass}`}>
      <div className="font-medium">Subtotal: {formatCurrency(summary.subtotal)}</div>
      {summary.igstGroups?.map((group) => (
        <div key={`igst-${group.rate}`}>
          IGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      {summary.cgstGroups.map((group) => (
        <div key={`cgst-${group.rate}`}>
          CGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      {summary.sgstGroups.map((group) => (
        <div key={`sgst-${group.rate}`}>
          SGST @ {Number(group.rate)}%: {formatCurrency(group.amount)}
        </div>
      ))}
      <div className="pt-1 font-semibold text-slate-900">
        Total Value: {formatCurrency(summary.total)}
      </div>
    </div>
  );
};

const PurchaseOrderRegister = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [records, setRecords] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [closedPoPromptRecord, setClosedPoPromptRecord] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || settings?.profile?.avatar || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

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

  const loadRecords = async () => {
    try {
      setLoading(true);
      setApiError("");
      const list = await fetchPurchaseOrders();
      setRecords(list);
    } catch (error) {
      setApiError(
        error?.response?.data?.error || error?.message || "Failed to load purchase orders."
      );
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const loadVendors = async () => {
    try {
      const list = await fetchVendors();
      setVendors(list);
    } catch {
      setVendors([]);
    }
  };

  const loadLocations = async () => {
    try {
      const list = await fetchLocations();
      setLocations(Array.isArray(list) ? list : []);
    } catch {
      setLocations([]);
    }
  };

  useEffect(() => {
    setProjects(getProjects());
    void loadVendors();
    void loadLocations();
    void loadRecords();
  }, []);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const vendorMap = useMemo(() => {
    return vendors.reduce((acc, vendor) => {
      acc[String(vendor.id)] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, location) => {
      acc[String(location.id)] = location;
      return acc;
    }, {});
  }, [locations]);

  const totalValue = records.reduce(
    (sum, record) => sum + buildGstSummary(record.items || []).total,
    0
  );

  const openOrdersCount = useMemo(
    () => records.filter((record) => !isClosedPurchaseOrder(record.status)).length,
    [records]
  );

  const filteredRecords = records.filter((record) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    const poNumber = record.poNumber ?? record.id;
    const projectName =
      projectMap[String(record.projectId)]?.name?.toLowerCase() || "";
    const vendorName =
      vendorMap[String(record.vendorId)]?.name?.toLowerCase() || "";
    const locationName =
      locationMap[String(record.locationId)]?.name?.toLowerCase() || "";
    return [
      poNumber,
      record.status,
      record.expectedDate,
      projectName,
      vendorName,
      locationName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const statusBadge = (status) => {
    const label = status || "Draft";
    const base =
      label.toLowerCase() === "closed"
        ? "bg-green-100 text-green-700"
        : label.toLowerCase().includes("partial")
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${base}`}>
        {label}
      </span>
    );
  };

  const toggleRow = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleEdit = (record) => {
    if (isClosedPurchaseOrder(record?.status)) {
      setClosedPoPromptRecord(record);
      setAdminPassword("");
      setAdminPasswordError("");
      return;
    }
    navigate("/inventory/purchase-order", { state: { purchaseOrder: record } });
  };

  const handleReceive = (record) => {
    if (isClosedPurchaseOrder(record?.status)) {
      setApiError("This Purchase Order is Closed.");
      return;
    }
    navigate(`/inventory/receive-goods?purchaseOrderId=${record.id}`, {
      state: { purchaseOrderId: record.id },
    });
  };

  const handleView = (record) => {
    setViewRecord(record);
  };

  const handlePrint = (record) => {
    setViewRecord(record);
    setTimeout(() => {
      printSection({
        selector: "#purchase-order-view-panel",
        title: "Purchase Order Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };

  const handleDelete = async (id) => {
    try {
      setApiError("");
      const record = records.find((entry) => String(entry.id) === String(id));
      if (isClosedPurchaseOrder(record?.status)) {
        setApiError("Closed purchase orders cannot be deleted.");
        return;
      }
      await deletePurchaseOrder(id);
      await loadRecords();
      if (viewRecord?.id === id) {
        setViewRecord(null);
      }
    } catch (error) {
      setApiError(
        error?.response?.data?.error || error?.message || "Failed to delete purchase order."
      );
    }
  };

  const getRecordTaxMode = (record) => {
    const vendor = vendorMap[String(record?.vendorId)];
    return getGstTaxMode({
      vendorState: vendor?.state,
      vendorGstin: vendor?.gstNumber,
      companyState: company.state,
      companyGstin: company.gstin,
    });
  };

  const confirmClosedPoEdit = () => {
    const nextError = getClosedPoAuthError(settings, adminPassword);
    if (nextError) {
      setAdminPasswordError(nextError);
      return;
    }
    if (!closedPoPromptRecord) {
      return;
    }
    navigate("/inventory/purchase-order", {
      state: {
        purchaseOrder: closedPoPromptRecord,
        closedPoAuthorized: true,
      },
    });
    setClosedPoPromptRecord(null);
    setAdminPassword("");
    setAdminPasswordError("");
  };

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Purchase Order Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review all purchase orders and their current status.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadRecords}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/inventory/purchase-order")}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            + Create PO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total POs</p>
          <p className="text-2xl font-semibold text-slate-800">
            {records.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Value</p>
          <p className="text-2xl font-semibold text-slate-800">
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open Orders</p>
          <p className="text-2xl font-semibold text-slate-800">
            {openOrdersCount}
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <div
        id="purchase-order-register"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto"
      >
        <div className="px-4 py-3 border-b flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Purchase Orders
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search PO number, vendor, project..."
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-72 max-w-full"
            />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[150px]">PO No</th>
              <th className="p-3 text-left min-w-[180px]">Vendor</th>
              <th className="p-3 text-left min-w-[180px]">Project</th>
              <th className="p-3 text-left min-w-[160px]">Location</th>
              <th className="p-3 text-left min-w-[140px]">Status</th>
              <th className="p-3 text-left min-w-[120px]">Items</th>
              <th className="p-3 text-left min-w-[140px]">Subtotal</th>
              <th className="p-3 text-left min-w-[140px]">GST</th>
              <th className="p-3 text-left min-w-[140px]">Total Value</th>
              <th className="p-3 text-left min-w-[140px]">Expected</th>
              <th className="p-3 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="11" className="p-6 text-center text-slate-500">
                  Loading purchase orders...
                </td>
              </tr>
            )}
            {!loading && filteredRecords.length === 0 && (
              <tr>
                <td colSpan="11" className="p-6 text-center text-slate-500">
                  {records.length === 0
                    ? "No purchase orders created yet."
                    : "No purchase orders match your search."}
                </td>
              </tr>
            )}
            {!loading &&
              filteredRecords.map((record, index) => {
                const key = record.id ?? `po-${index}`;
                const rowId = record.id ?? `expanded-${index}`;
                const project = projectMap[String(record.projectId)];
                const vendor = vendorMap[String(record.vendorId)];
                const location = locationMap[String(record.locationId)];
                const summary = buildGstSummary(record.items || [], {
                  taxMode: getRecordTaxMode(record),
                });
                const isClosed = isClosedPurchaseOrder(record.status);
                return (
                  <Fragment key={key}>
                    <tr
                      className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleRow(rowId)}
                    >
                      <td className="p-3 font-medium text-slate-800">
                        {record.poNumber || record.id}
                      </td>
                      <td className="p-3">{vendor?.name || "-"}</td>
                      <td className="p-3">{project?.name || "-"}</td>
                      <td className="p-3">{location?.name || "-"}</td>
                      <td className="p-3">{statusBadge(record.status)}</td>
                      <td className="p-3">{record.items?.length || 0}</td>
                      <td className="p-3 font-medium">
                        {formatCurrency(summary.subtotal)}
                      </td>
                      <td className="p-3 font-medium">
                        {formatCurrency(summary.totalTax)}
                      </td>
                      <td className="p-3 font-medium">
                        {formatCurrency(summary.total)}
                      </td>
                      <td className="p-3">
                        {formatDate(record.expectedDate || record.orderDate)}
                      </td>
                      <td className="p-3 flex gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleView(record);
                          }}
                          className="text-slate-700 text-sm underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrint(record);
                          }}
                          className="text-slate-600 text-sm"
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleReceive(record);
                          }}
                          disabled={isClosed}
                          className="text-emerald-600 text-sm disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Receive
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(record);
                          }}
                          disabled={isClosed}
                          className="text-indigo-600 text-sm disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(record.id);
                          }}
                          disabled={isClosed}
                          className="text-red-600 text-sm disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>

                    {expandedId === rowId && (
                      <tr className="bg-slate-50">
                        <td colSpan="11" className="p-4">
                          <div className="space-y-4">
                            {isClosed && (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                This Purchase Order is Closed.
                              </div>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm text-slate-700">
                              <p>
                                <strong>PO No:</strong> {record.poNumber || record.id}
                              </p>
                              <p>
                                <strong>Status:</strong> {record.status || "-"}
                              </p>
                              <p>
                                <strong>Project:</strong> {project?.name || "-"}
                              </p>
                              <p>
                                <strong>Vendor:</strong> {vendor?.name || "-"}
                              </p>
                              <p>
                                <strong>Location:</strong> {location?.name || "-"}
                              </p>
                              <p>
                                <strong>Order Date:</strong> {formatDate(record.orderDate) || "-"}
                              </p>
                              <p>
                                <strong>Expected Date:</strong>{" "}
                                {formatDate(record.expectedDate) || "-"}
                              </p>
                              <p>
                                <strong>Total Value:</strong> {formatCurrency(summary.total)}
                              </p>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <GstSummaryBlock
                                summary={summary}
                                formatCurrency={formatCurrency}
                              />
                            </div>

                            <div>
                              <h4 className="font-semibold text-slate-700 mb-2">
                                Line Items
                              </h4>
                              <div className="overflow-x-auto border rounded-md">
                                <table className="w-full text-sm">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="p-2 text-left">Item</th>
                                      <th className="p-2 text-left">Description</th>
                                      <th className="p-2 text-left">Unit</th>
                                      <th className="p-2 text-left">Qty</th>
                                      <th className="p-2 text-left">Unit Price</th>
                                      <th className="p-2 text-left">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(record.items || []).length === 0 && (
                                      <tr>
                                        <td colSpan="6" className="p-3 text-slate-500 text-center">
                                          No line items.
                                        </td>
                                      </tr>
                                    )}
                                    {(record.items || []).map((item, itemIndex) => {
                                      const qty = Number(item.quantity ?? 0) || 0;
                                      const rate = Number(item.unitPrice ?? item.rate ?? 0) || 0;
                                      const amount =
                                        Number(item.totalPrice ?? qty * rate) || 0;
                                      return (
                                        <tr
                                          key={item.id ?? item.itemId ?? `${key}-item-${itemIndex}`}
                                          className="border-t"
                                        >
                                          <td className="p-2 font-medium text-slate-800">
                                            {item.name || (item.itemId ? `Item ${item.itemId}` : "-")}
                                          </td>
                                          <td className="p-2">{item.description || "-"}</td>
                                          <td className="p-2">{item.unit || "-"}</td>
                                          <td className="p-2">{qty}</td>
                                          <td className="p-2">{formatCurrency(rate)}</td>
                                          <td className="p-2">{formatCurrency(amount)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
      {viewRecord && (
        (() => {
          const summary = buildGstSummary(viewRecord.items || [], {
            taxMode: getRecordTaxMode(viewRecord),
          });
          const vendor = vendorMap[String(viewRecord.vendorId)];
          const primaryContact = vendor?.contacts?.[0];
          return (
        <DocumentViewPanel
          id="purchase-order-view-panel"
          title="PURCHASE ORDER"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={brandDescription}
          companyGstin={company.gstin}
          companyPhone={company.phone}
          companyEmail={company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "PO No", value: viewRecord.poNumber || viewRecord.id },
            { label: "Date", value: formatDate(viewRecord.orderDate) },
            { label: "Expected", value: formatDate(viewRecord.expectedDate) },
            { label: "Status", value: viewRecord.status },
          ]}
          leftBlockTitle="Vendor"
          leftBlockLines={[
            vendor?.name || "-",
            primaryContact?.contactName || vendor?.email || "-",
            primaryContact?.phone || vendor?.phone || "-",
          ]}
          rightBlockTitle="Project"
          rightBlockLines={[
            projectMap[String(viewRecord.projectId)]?.name || "-",
            locationMap[String(viewRecord.locationId)]?.name || "-",
            projectMap[String(viewRecord.projectId)]?.client || "-",
          ]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Item" },
            { key: "description", label: "Description" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "quantity", label: "Qty", align: "right", widthClass: "w-20" },
            { key: "rate", label: "Unit Price", align: "right", widthClass: "w-24" },
            { key: "amount", label: "Amount", align: "right", widthClass: "w-28" },
          ]}
          tableRows={(viewRecord.items || []).map((item, index) => {
            const qty = Number(item.quantity || 0);
            const rate = Number(item.rate ?? item.unitPrice ?? 0);
            const amount = Number(item.totalPrice ?? qty * rate);
            return {
              id: item.id || index,
              serial: index + 1,
              name: item.name,
              description: item.description || "-",
              unit: item.unit,
              quantity: qty,
              rate: formatCurrency(rate),
              amount: formatCurrency(amount),
            };
          })}
          bottomLeftContent={
            isClosedPurchaseOrder(viewRecord.status) ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800">
                This Purchase Order is Closed.
              </div>
            ) : null
          }
          bottomRightContent={
            <GstSummaryBlock
              summary={summary}
              formatCurrency={formatCurrency}
              align="right"
            />
          }
          footerCompanyName={brandName || "Company"}
          hideFooterNote
        />
          );
        })()
      )}

      <PasswordPromptModal
        isOpen={Boolean(closedPoPromptRecord)}
        title="Unlock Closed PO"
        description="Enter the admin password to edit this closed purchase order."
        password={adminPassword}
        error={adminPasswordError}
        confirmLabel="Unlock"
        onPasswordChange={(value) => {
          setAdminPassword(value);
          if (adminPasswordError) {
            setAdminPasswordError("");
          }
        }}
        onCancel={() => {
          setClosedPoPromptRecord(null);
          setAdminPassword("");
          setAdminPasswordError("");
        }}
        onConfirm={confirmClosedPoEdit}
      />
    </div>
  );
};

export default PurchaseOrderRegister;
