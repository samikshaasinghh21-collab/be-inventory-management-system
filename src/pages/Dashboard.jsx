import { useCallback, useEffect, useMemo, useState } from "react";
import ExecutiveOverview from "../components/dashboard/ExecutiveOverview";
import { parseDateValue } from "../utils/dateFormat";
import {
  roundUnitPrice,
} from "../utils/formatters";
import { isApiUnavailableError } from "../services/api";
import { fetchProjects } from "../services/projectsApi";
import {
  getProjects as getLocalProjects,
  setProjects as setLocalProjects,
} from "../services/projectsStore";
import { fetchBoqs } from "../services/boqApi";
import { fetchPurchaseOrders } from "../services/purchaseOrdersApi";
import { fetchReceiveGoods } from "../services/receiveGoodsApi";
import { fetchDeliveryChallans } from "../services/deliveryChallanApi";
import { fetchLocations } from "../services/locationsApi";
import { fetchVendors } from "../services/vendorsApi";
import { fetchItems } from "../services/inventoryApi";
import { getWorkflowList } from "../services/workflowStore";
import { fetchConsumptions } from "../services/consumptionApi";

const WORKFLOW_CONSUMPTION_KEY = "workflow_consumption";
const WORKFLOW_GOODS_DELIVERED_KEY = "workflow_goods_delivered";
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const isInMonth = (value, monthOffset = 0) => {
  const date = parseDateValue(value);
  if (!date) return false;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth()
  );
};
const dateKey = (value) => {
  const date = parseDateValue(value);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const sumQty = (items = [], key = "quantity") =>
  items.reduce((sum, item) => sum + toNumber(item?.[key]), 0);
const isPendingStatus = (status) => {
  const value = normalizeText(status);
  if (!value) return true;
  return !["closed", "cancelled", "canceled", "completed"].some((state) =>
    value.includes(state)
  );
};

const safelyReadList = (reader) => {
  try {
    const value = reader();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const getFallbackDashboardData = () => ({
  projects: safelyReadList(getLocalProjects),
  boqs: [],
  purchaseOrders: [],
  receiveGoods: [],
  deliveryChallans: [],
  locations: [],
  vendors: [],
  items: [],
  consumption: safelyReadList(() => getWorkflowList(WORKFLOW_CONSUMPTION_KEY)),
  goodsDelivered: safelyReadList(() =>
    getWorkflowList(WORKFLOW_GOODS_DELIVERED_KEY)
  ),
});

const Dashboard = () => {


  const [activeTab, setActiveTab] = useState("overview");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState([]);
  const [data, setData] = useState({
    projects: [],
    boqs: [],
    purchaseOrders: [],
    receiveGoods: [],
    deliveryChallans: [],
    locations: [],
    vendors: [],
    items: [],
    consumption: [],
    goodsDelivered: [],
  });



  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const results = await Promise.allSettled([
        fetchProjects(),
        fetchBoqs(),
        fetchPurchaseOrders(),
        fetchReceiveGoods(),
        fetchDeliveryChallans(),
        fetchLocations(),
        fetchVendors(),
        fetchItems(),
        fetchConsumptions(),
      ]);

    const unavailableResults = results.filter(
      (result) =>
        result.status === "rejected" && isApiUnavailableError(result.reason)
    );

    if (unavailableResults.length === results.length) {
      const firstUnavailableError = unavailableResults[0]?.reason;
      setData(getFallbackDashboardData());
      setErrors([
        firstUnavailableError?.response?.data?.error ||
          firstUnavailableError?.message ||
          "Inventory API is unavailable.",
      ]);

      return;
    }

    const nextErrors = [];
    const readList = (result, label, fallback = []) => {
      if (result.status === "fulfilled") {
        return Array.isArray(result.value) ? result.value : [];
      }
      nextErrors.push(
        `${label}: ${
          result.reason?.response?.data?.error ||
          result.reason?.message ||
          "Failed to load"
        }`
      );
      return fallback;
    };

    const fallbackProjects = getLocalProjects();
    const projects = readList(results[0], "Projects", fallbackProjects);
    if (results[0].status === "fulfilled") {
      try {
        if (JSON.stringify(getLocalProjects()) !== JSON.stringify(projects)) {
          setLocalProjects(projects);
        }
      } catch {
        // ignore cache errors
      }
    }

    setData({
      projects,
      boqs: readList(results[1], "BOQs"),
      purchaseOrders: readList(results[2], "Purchase Orders"),
      receiveGoods: readList(results[3], "Receive Goods"),
      deliveryChallans: readList(results[4], "Delivery Challans"),
      locations: readList(results[5], "Locations"),
      vendors: readList(results[6], "Vendors"),
      items: readList(results[7], "Items"),
      consumption: readList(
        results[8],
        "Consumption",
        getWorkflowList(WORKFLOW_CONSUMPTION_KEY)
      ),
      goodsDelivered: getWorkflowList(WORKFLOW_GOODS_DELIVERED_KEY),
    });
      setErrors(nextErrors);
    } catch (error) {
      setData(getFallbackDashboardData());
      setErrors([
        error?.response?.data?.error ||
          error?.message ||
          "Dashboard data could not be loaded.",
      ]);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const reload = () => void loadDashboard({ silent: true });
    window.addEventListener("boqs:changed", reload);
    window.addEventListener("purchase-orders:changed", reload);
    window.addEventListener("receive-goods:changed", reload);
    window.addEventListener("delivery-challans:changed", reload);
    window.addEventListener("consumptions:changed", reload);
    window.addEventListener(`${WORKFLOW_CONSUMPTION_KEY}:changed`, reload);
    window.addEventListener(`${WORKFLOW_GOODS_DELIVERED_KEY}:changed`, reload);
    window.addEventListener("projects:changed", reload);
    window.addEventListener("vendors:changed", reload);
    window.addEventListener("locations:changed", reload);
    window.addEventListener("settings:changed", reload);
    return () => {
      window.removeEventListener("boqs:changed", reload);
      window.removeEventListener("purchase-orders:changed", reload);
      window.removeEventListener("receive-goods:changed", reload);
      window.removeEventListener("delivery-challans:changed", reload);
      window.removeEventListener("consumptions:changed", reload);
      window.removeEventListener(`${WORKFLOW_CONSUMPTION_KEY}:changed`, reload);
      window.removeEventListener(
        `${WORKFLOW_GOODS_DELIVERED_KEY}:changed`,
        reload
      );
      window.removeEventListener("projects:changed", reload);
      window.removeEventListener("vendors:changed", reload);
      window.removeEventListener("locations:changed", reload);
      window.removeEventListener("settings:changed", reload);
    };
  }, [loadDashboard]);

  const projectMap = useMemo(
    () =>
      data.projects.reduce((acc, project) => {
        acc[String(project.id)] = project;
        return acc;
      }, {}),
    [data.projects]
  );

  const vendorMap = useMemo(
    () =>
      data.vendors.reduce((acc, vendor) => {
        acc[String(vendor.id)] = vendor;
        return acc;
      }, {}),
    [data.vendors]
  );

  const locationMap = useMemo(
    () =>
      data.locations.reduce((acc, location) => {
        acc[String(location.id)] = location;
        return acc;
      }, {}),
    [data.locations]
  );

  const poMap = useMemo(
    () =>
      data.purchaseOrders.reduce((acc, po) => {
        acc[String(po.id)] = po;
        return acc;
      }, {}),
    [data.purchaseOrders]
  );

  const activeProjectId = useMemo(() => {
    if (selectedProjectId === "all") return "all";
    const exists = data.projects.some(
      (project) => String(project.id) === selectedProjectId
    );
    return exists ? selectedProjectId : "all";
  }, [data.projects, selectedProjectId]);

  const metrics = useMemo(() => {
    const isAllProjects = activeProjectId === "all";
    const matchProject = (projectId) =>
      isAllProjects || String(projectId) === activeProjectId;
    const scopedProjects = data.projects.filter((project) =>
      matchProject(project.id)
    );

    const boqs = data.boqs.filter((boq) => matchProject(boq.projectId));
    const purchaseOrders = data.purchaseOrders.filter((po) =>
      matchProject(po.projectId)
    );
    const pendingOrders = purchaseOrders.filter((po) => isPendingStatus(po.status));
    const pendingThisMonth = pendingOrders.filter((po) =>
      isInMonth(po.orderDate ?? po.createdAt)
    ).length;
    const receiveGoods = data.receiveGoods.filter((receipt) => {
      const fallbackProjectId =
        poMap[String(receipt.purchaseOrderId)]?.projectId ?? null;
      return matchProject(receipt.projectId ?? fallbackProjectId);
    });
    const deliveryChallans = data.deliveryChallans.filter((dc) =>
      matchProject(dc.projectId)
    );
    const consumption = data.consumption.filter((record) =>
      matchProject(record.projectId)
    );
    const goodsDelivered = data.goodsDelivered.filter((record) =>
      matchProject(record.projectId)
    );

    const inventoryValue = isAllProjects
      ? data.items.reduce(
          (sum, item) => sum + toNumber(item.stock) * roundUnitPrice(item.price),
          0
        )
      : purchaseOrders.reduce((sum, po) => sum + toNumber(po.total), 0);

    const receivedQty = receiveGoods.reduce(
      (sum, receipt) => sum + sumQty(receipt.items, "receivedQty"),
      0
    );
    const receivedThisMonth = receiveGoods.reduce((sum, receipt) => {
      if (!isInMonth(receipt.receivedDate ?? receipt.createdAt)) return sum;
      return sum + sumQty(receipt.items, "receivedQty");
    }, 0);
    const receivedLastMonth = receiveGoods.reduce((sum, receipt) => {
      if (!isInMonth(receipt.receivedDate ?? receipt.createdAt, -1)) return sum;
      return sum + sumQty(receipt.items, "receivedQty");
    }, 0);
    const receivedGrowth =
      receivedLastMonth > 0
        ? ((receivedThisMonth - receivedLastMonth) / receivedLastMonth) * 100
        : receivedThisMonth > 0
        ? 100
        : 0;

    const deliveredSource = goodsDelivered.length ? goodsDelivered : deliveryChallans;
    const deliveredQty = deliveredSource.reduce(
      (sum, record) => sum + sumQty(record.items),
      0
    );
    const deliveredThisMonth = deliveredSource.reduce((sum, record) => {
      const valueDate =
        record.deliveredDate ?? record.issueDate ?? record.createdAt;
      if (!isInMonth(valueDate)) return sum;
      return sum + sumQty(record.items);
    }, 0);

    const categoryMap = new Map(
      data.items.map((item) => [normalizeText(item.name), item.category || "Other"])
    );
    const categoryTotals = new Map();
    const sourceItems =
      consumption.length > 0
        ? consumption.flatMap((record) => record.items || [])
        : purchaseOrders.flatMap((po) => po.items || []);
    sourceItems.forEach((item) => {
      const quantity = toNumber(item.quantity);
      if (quantity <= 0) return;
      const category = categoryMap.get(normalizeText(item.name)) || "Other";
      categoryTotals.set(category, toNumber(categoryTotals.get(category)) + quantity);
    });
    const categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], index) => ({
        name,
        value,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
    const totalCategory = categories.reduce(
      (sum, category) => sum + toNumber(category.value),
      0
    );
    const categoriesWithPercent = categories.reduce(
      (acc, category) => {
        const percent = totalCategory ? (category.value / totalCategory) * 100 : 0;
        const start = acc.cursor;
        const end = start + percent;
        return {
          cursor: end,
          entries: [
            ...acc.entries,
            {
              ...category,
              percent,
              start,
              end,
            },
          ],
        };
      },
      { cursor: 0, entries: [] }
    ).entries;
    const donutGradient = categoriesWithPercent.length
      ? `conic-gradient(${categoriesWithPercent
          .map((entry) => `${entry.color} ${entry.start}% ${entry.end}%`)
          .join(", ")})`
      : "conic-gradient(#cbd5e1 0% 100%)";

    const locationDayMap = new Map();
    const locationTotalMap = new Map();
    const registerLocation = (locationId, when, qty) => {
      const id = String(locationId ?? "");
      const key = dateKey(when);
      if (!id || !key || qty <= 0) return;
      const composite = `${key}|${id}`;
      locationDayMap.set(composite, toNumber(locationDayMap.get(composite)) + qty);
      locationTotalMap.set(id, toNumber(locationTotalMap.get(id)) + qty);
    };
    receiveGoods.forEach((receipt) => {
      const fallbackLocationId = poMap[String(receipt.purchaseOrderId)]?.locationId;
      registerLocation(
        receipt.locationId ?? fallbackLocationId,
        receipt.receivedDate ?? receipt.createdAt,
        sumQty(receipt.items, "receivedQty")
      );
    });
    consumption.forEach((record) => {
      registerLocation(
        record.locationId,
        record.consumptionDate ?? record.createdAt,
        sumQty(record.items)
      );
    });
    const topLocationIds = Array.from(locationTotalMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id);
    const locationSeries = topLocationIds.map((id, index) => ({
      id,
      label: locationMap[id]?.name || "Location",
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const chartDays = [];
    for (let i = 6; i >= 0; i -= 1) {
      const point = new Date(base);
      point.setDate(base.getDate() - i);
      const key = dateKey(point);
      chartDays.push({
        label: point.toLocaleDateString("en-GB", { weekday: "short" }),
        values: locationSeries.map((series) =>
          toNumber(locationDayMap.get(`${key}|${series.id}`))
        ),
      });
    }
    const chartMax = Math.max(1, ...chartDays.flatMap((day) => day.values));

    const activities = [
      ...boqs.map((boq) => ({
        id: `boq-${boq.id}`,
        date: boq.updatedAt ?? boq.date ?? boq.createdAt,
        title: `${boq.boqNumber || "BOQ"} ${boq.status || "updated"}`,
        detail: projectMap[String(boq.projectId)]?.name || "Project",
        color: "#3b82f6",
        kind: "boq",
      })),
      ...purchaseOrders.map((po) => ({
        id: `po-${po.id}`,
        date: po.orderDate ?? po.createdAt,
        title: `${po.poNumber || "PO"} ${po.status || ""}`,
        detail: vendorMap[String(po.vendorId)]?.name || "Vendor",
        color: "#f59e0b",
        kind: "po",
      })),
      ...receiveGoods.map((receipt) => ({
        id: `receipt-${receipt.id}`,
        date: receipt.receivedDate ?? receipt.createdAt,
        title: `Goods received${
          locationMap[
            String(receipt.locationId ?? poMap[String(receipt.purchaseOrderId)]?.locationId)
          ]?.name
            ? ` at ${
                locationMap[
                  String(
                    receipt.locationId ??
                      poMap[String(receipt.purchaseOrderId)]?.locationId
                  )
                ]?.name
              }`
            : ""
        }`,
        detail: `${
          poMap[String(receipt.purchaseOrderId)]?.poNumber || "Receipt"
        } • ${sumQty(receipt.items, "receivedQty")} units`,
        color: "#10b981",
        kind: "receipt",
      })),
      ...consumption.map((record) => ({
        id: `cons-${record.id}`,
        date: record.consumptionDate ?? record.createdAt,
        title: "Consumption logged",
        detail: `${sumQty(record.items)} units`,
        color: "#ef4444",
        kind: "consumption",
      })),
    ]
      .filter((entry) => parseDateValue(entry.date))
      .sort(
        (a, b) =>
          parseDateValue(b.date).getTime() - parseDateValue(a.date).getTime()
      );

    const projectReportRows = data.projects
      .filter((project) => (isAllProjects ? true : matchProject(project.id)))
      .map((project) => {
        const projectId = String(project.id);
        const projectOrders = data.purchaseOrders.filter(
          (po) => String(po.projectId) === projectId
        );
        return {
          id: project.id,
          name: project.name || "-",
          code: project.code || "-",
          boqs: data.boqs.filter((boq) => String(boq.projectId) === projectId).length,
          pending: projectOrders.filter((po) => isPendingStatus(po.status)).length,
          value: projectOrders.reduce((sum, po) => sum + toNumber(po.total), 0),
          received: data.receiveGoods
            .filter((receipt) => {
              const fallbackProjectId =
                poMap[String(receipt.purchaseOrderId)]?.projectId;
              return String(receipt.projectId ?? fallbackProjectId) === projectId;
            })
            .reduce((sum, receipt) => sum + sumQty(receipt.items, "receivedQty"), 0),
          consumed: data.consumption
            .filter((record) => String(record.projectId) === projectId)
            .reduce((sum, record) => sum + sumQty(record.items), 0),
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      pendingOrders,
      activities,
      projectReportRows,
      chartDays,
      chartMax,
      locationSeries,
      categories: categoriesWithPercent,
      donutGradient,
      cards: {
        totalProjects: scopedProjects.length,
        projectsThisMonth: scopedProjects.filter((project) =>
          isInMonth(project.createdAt ?? project.startDate)
        ).length,
        totalBoqs: boqs.length,
        boqsThisMonth: boqs.filter((boq) => isInMonth(boq.date ?? boq.createdAt))
          .length,
        pendingOrders: pendingOrders.length,
        pendingAmount: pendingOrders.reduce((sum, po) => sum + toNumber(po.total), 0),
        pendingThisMonth,
        deliveredQty,
        deliveredThisMonth,
        inventoryValue,
        receivedThisMonth,
        receivedQty,
        receivedGrowth,
      },
      finance: {
        consumedValue: consumption.reduce(
          (sum, record) =>
            sum +
            (record.items || []).reduce(
              (line, item) => line + toNumber(item.quantity) * toNumber(item.rate),
              0
            ),
          0
        ),
        purchaseValue: purchaseOrders.reduce((sum, po) => sum + toNumber(po.total), 0),
      },
    };
  }, [
    data.boqs,
    data.consumption,
    data.deliveryChallans,
    data.goodsDelivered,
    data.items,
    data.projects,
    data.purchaseOrders,
    data.receiveGoods,
    locationMap,
    poMap,
    projectMap,
    activeProjectId,
    vendorMap,
  ]);

  const query = normalizeText(search);
  const visiblePending = useMemo(() => {
    const rows = metrics.pendingOrders;
    if (!query) return rows.slice(0, 6);
    return rows
      .filter((po) =>
        normalizeText(
          `${po.poNumber} ${vendorMap[String(po.vendorId)]?.name || ""} ${
            projectMap[String(po.projectId)]?.name || ""
          }`
        ).includes(query)
      )
      .slice(0, 6);
  }, [metrics.pendingOrders, projectMap, query, vendorMap]);

  const visibleActivities = useMemo(() => {
    const rows = metrics.activities;
    if (!query) return rows.slice(0, 8);
    return rows
      .filter((entry) => normalizeText(`${entry.title} ${entry.detail}`).includes(query))
      .slice(0, 8);
  }, [metrics.activities, query]);

  return <ExecutiveOverview data={data} metrics={metrics} loading={loading} refreshing={refreshing} errors={errors} reload={loadDashboard} activeTab={activeTab} setActiveTab={setActiveTab} selectedProjectId={activeProjectId} setSelectedProjectId={setSelectedProjectId} search={search} setSearch={setSearch} visiblePending={visiblePending} visibleActivities={visibleActivities} vendorMap={vendorMap} />;
};
export default Dashboard;
