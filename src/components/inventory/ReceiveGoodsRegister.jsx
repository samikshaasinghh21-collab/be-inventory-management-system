import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchReceiveGoods } from "../../services/receiveGoodsApi";
import { fetchPurchaseOrders } from "../../services/purchaseOrdersApi";
import { getProjects } from "../../services/projectsStore";
import { fetchVendors } from "../../services/vendorsApi";
import { fetchLocations } from "../../services/locationsApi";
import useSettings from "../../hooks/useSettings";
import { formatDate } from "../../utils/dateFormat";

const ReceiveGoodsRegister = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";

  const [receipts, setReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filterProject, setFilterProject] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

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

  const loadData = async () => {
    try {
      setLoading(true);
      setApiError("");
      const [receiptList, poList, vendorList, locationList] = await Promise.all([
        fetchReceiveGoods(),
        fetchPurchaseOrders(),
        fetchVendors(),
        fetchLocations(),
      ]);
      setReceipts(Array.isArray(receiptList) ? receiptList : []);
      setPurchaseOrders(Array.isArray(poList) ? poList : []);
      setVendors(Array.isArray(vendorList) ? vendorList : []);
      setLocations(Array.isArray(locationList) ? locationList : []);
      setProjects(getProjects());
    } catch (error) {
      setApiError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load receipts."
      );
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const poMap = useMemo(() => {
    return purchaseOrders.reduce((acc, po) => {
      acc[String(po.id)] = po;
      return acc;
    }, {});
  }, [purchaseOrders]);

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

  const filteredReceipts = receipts.filter((receipt) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const po = poMap[String(receipt.purchaseOrderId)];
    const poNumber = po?.poNumber ?? receipt.purchaseOrderId ?? "";
    const receivedBy = receipt.receivedBy || "";
    const projectName =
      projectMap[String(receipt.projectId)]?.name?.toLowerCase() || "";
    const vendorName =
      vendorMap[String(receipt.vendorId)]?.name?.toLowerCase() || "";
    const locationName =
      locationMap[String(receipt.locationId)]?.name?.toLowerCase() ||
      locationMap[String(po?.locationId)]?.name?.toLowerCase() ||
      "";
    return [poNumber, receivedBy, projectName, vendorName, locationName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const filteredWithSelectors = filteredReceipts.filter((receipt) => {
    const matchesProject =
      !filterProject || String(receipt.projectId) === String(filterProject);
    const matchesVendor =
      !filterVendor || String(receipt.vendorId) === String(filterVendor);
    const matchesStatus =
      !filterStatus ||
      (receipt.status || poMap[String(receipt.purchaseOrderId)]?.status || "")
        .toLowerCase() === filterStatus.toLowerCase();
    return matchesProject && matchesVendor && matchesStatus;
  });

  const totalReceivedLines = receipts.reduce(
    (sum, rec) => sum + (rec.items?.length || 0),
    0
  );

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

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Receipts Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View and search all goods received against purchase orders.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/inventory/receive-goods")}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            New Receipt
          </button>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Total Receipts</p>
          <p className="text-2xl font-semibold text-slate-800">
            {receipts.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Lines Received</p>
          <p className="text-2xl font-semibold text-slate-800">
            {totalReceivedLines}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Open POs Impacted</p>
          <p className="text-2xl font-semibold text-slate-800">
            {
              new Set(
                receipts
                  .filter((rec) => (poMap[String(rec.purchaseOrderId)]?.status ?? "").toLowerCase() !== "closed")
                  .map((rec) => rec.purchaseOrderId)
              ).size
            }
          </p>
        </div>
      </div>

      {apiError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800">Receipts</h3>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search PO, project, vendor, received by..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-72 max-w-full"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="Closed">Closed</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[140px]">PO No</th>
              <th className="p-3 text-left min-w-[160px]">Project</th>
              <th className="p-3 text-left min-w-[160px]">Vendor</th>
              <th className="p-3 text-left min-w-[140px]">Location</th>
              <th className="p-3 text-left min-w-[140px]">Received Date</th>
              <th className="p-3 text-left min-w-[140px]">Received By</th>
              <th className="p-3 text-left min-w-[120px]">Status</th>
              <th className="p-3 text-left min-w-[110px]">Items</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  Loading receipts...
                </td>
              </tr>
            )}
            {!loading && filteredReceipts.length === 0 && (
              <tr>
                <td colSpan="8" className="p-6 text-center text-slate-500">
                  No receipts found.
                </td>
              </tr>
            )}
            {!loading &&
              filteredWithSelectors.map((receipt) => {
                const po = poMap[String(receipt.purchaseOrderId)];
                const project = projectMap[String(receipt.projectId || po?.projectId)];
                const vendor = vendorMap[String(receipt.vendorId || po?.vendorId)];
                const location = locationMap[String(receipt.locationId || po?.locationId)];
                return (
                  <>
                    <tr
                      key={receipt.id}
                      className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleRow(receipt.id)}
                    >
                      <td className="p-3 font-medium text-slate-800">
                        {po?.poNumber || receipt.purchaseOrderId || "-"}
                      </td>
                      <td className="p-3">{project?.name || "-"}</td>
                      <td className="p-3">{vendor?.name || "-"}</td>
                      <td className="p-3">{location?.name || "-"}</td>
                      <td className="p-3">
                        {formatDate(receipt.receivedDate) || "-"}
                      </td>
                      <td className="p-3">{receipt.receivedBy || "-"}</td>
                      <td className="p-3">
                        {statusBadge(receipt.status || po?.status)}
                      </td>
                      <td className="p-3">{receipt.items?.length || 0}</td>
                    </tr>
                    {expandedId === receipt.id && (
                      <tr className="bg-slate-50">
                        <td colSpan="8" className="p-4">
                          <div className="space-y-4">
                            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                              <span>
                                <strong>PO:</strong>{" "}
                                {po?.poNumber || receipt.purchaseOrderId || "-"}
                              </span>
                              <span>
                                <strong>Project:</strong>{" "}
                                {project?.name || "-"}
                              </span>
                              <span>
                                <strong>Vendor:</strong> {vendor?.name || "-"}
                              </span>
                              <span>
                                <strong>Location:</strong>{" "}
                                {location?.name || "-"}
                              </span>
                            </div>

                            <div>
                              <h4 className="font-semibold text-slate-700 mb-2">
                                Items Received
                              </h4>
                              <div className="overflow-x-auto border rounded-md">
                                <table className="w-full text-sm">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="p-2 text-left">Item</th>
                                      <th className="p-2 text-left">Ordered</th>
                                      <th className="p-2 text-left">Received</th>
                                      <th className="p-2 text-left">Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(receipt.items || []).map((item, idx) => {
                                      const ordered =
                                        item.orderedQty ??
                                        item.quantity ??
                                        item.OrderedQty ??
                                        0;
                                      const received =
                                        item.receivedQty ??
                                        item.ReceivedQty ??
                                        0;
                                      const balance =
                                        item.balanceQty ??
                                        item.BalanceQty ??
                                        ordered - received;
                                      const poItem =
                                        po?.items?.find(
                                          (poLine) =>
                                            String(poLine.itemId ?? poLine.id) ===
                                            String(item.itemId ?? item.id)
                                        ) || {};
                                      const displayItemName =
                                        item.name ||
                                        poItem.name ||
                                        (item.itemId ? `Item ${item.itemId}` : "-");
                                      return (
                                        <tr
                                          key={item.id ?? item.itemId ?? idx}
                                          className="border-t"
                                        >
                                          <td className="p-2">{displayItemName}</td>
                                          <td className="p-2">{ordered}</td>
                                          <td className="p-2">{received}</td>
                                          <td className="p-2">{balance}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="text-sm text-slate-600 space-y-1">
                              <p>
                                <strong>Notes:</strong>{" "}
                                {receipt.notes || "-"}
                              </p>
                              <p>
                                <strong>Created:</strong>{" "}
                                {formatDate(receipt.createdAt) || "-"}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReceiveGoodsRegister;
