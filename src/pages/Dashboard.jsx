import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSettings from "../hooks/useSettings";
import { formatDate } from "../utils/dateFormat";
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
const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#06b6d4", "#6366f1"];

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const parseDateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const formatActivityTime = (value) => {
  const date = parseDateValue(value);
  if (!date) return "-";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
};

const ActionIconButton = ({ children }) => (
  <button
    type="button"
    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-slate-700 hover:shadow"
  >
    {children}
  </button>
);

const SummaryCard = ({
  icon,
  title,
  value,
  trend,
  subtext,
  iconWrapClass,
  accentClass = "from-blue-500 via-blue-400 to-cyan-300",
  trendClass = "text-emerald-600",
  valueClass = "text-slate-900",
  trailing,
}) => (
  <div className="group relative min-h-[126px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accentClass}`} />
    <span className="absolute -right-9 -top-9 h-24 w-24 rounded-full bg-slate-100/70 blur-2xl" />
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[20px] ${iconWrapClass}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-[17px] font-medium text-slate-700">{title}</p>
          <p className={`mt-1 text-[44px] font-semibold leading-none tracking-tight ${valueClass}`}>
            {value}
          </p>
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
    <p className="mt-2.5 flex items-center gap-2 text-[14px] text-slate-600">
      <span className={`font-semibold ${trendClass}`}>{trend}</span>
      <span>{subtext}</span>
    </p>
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";

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

  const formatCurrency = useCallback(
    (value) => {
      const amount = toNumber(value);
      try {
        return new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(amount);
      } catch {
        return `${currency} ${amount.toLocaleString("en-IN")}`;
      }
    },
    [currency]
  );

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

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
        setLocalProjects(projects);
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

    if (silent) setRefreshing(false);
    else setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const reload = () => void loadDashboard({ silent: true });
    window.addEventListener("consumptions:changed", reload);
    window.addEventListener(`${WORKFLOW_CONSUMPTION_KEY}:changed`, reload);
    window.addEventListener(`${WORKFLOW_GOODS_DELIVERED_KEY}:changed`, reload);
    window.addEventListener("projects:changed", reload);
    return () => {
      window.removeEventListener("consumptions:changed", reload);
      window.removeEventListener(`${WORKFLOW_CONSUMPTION_KEY}:changed`, reload);
      window.removeEventListener(
        `${WORKFLOW_GOODS_DELIVERED_KEY}:changed`,
        reload
      );
      window.removeEventListener("projects:changed", reload);
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
          (sum, item) => sum + toNumber(item.stock) * toNumber(item.price),
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
        label: point.toLocaleDateString("en-US", { weekday: "short" }),
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
        title: `Receipt ${poMap[String(receipt.purchaseOrderId)]?.poNumber || ""}`,
        detail: `${sumQty(receipt.items, "receivedQty")} units`,
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

  const getActivityIcon = (kind) => {
    if (kind === "boq") {
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 4h10v16H7z" />
          <path d="M9.5 8h5M9.5 12h5M9.5 16h3" />
        </svg>
      );
    }
    if (kind === "po") {
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 7h12v12H6z" />
          <path d="M9 7V5h6v2M9 12h6" />
        </svg>
      );
    }
    if (kind === "receipt") {
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16v10H4z" />
          <path d="M8 11h8M8 14h5" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 6h12v12H6z" />
        <path d="M9 9h6M9 12h4M9 15h3" />
      </svg>
    );
  };

  const getActivityBadgeClass = (kind) => {
    if (kind === "boq") return "bg-blue-100 text-blue-600";
    if (kind === "po") return "bg-amber-100 text-amber-600";
    if (kind === "receipt") return "bg-emerald-100 text-emerald-600";
    return "bg-rose-100 text-rose-600";
  };

  const chartSeries = metrics.locationSeries.map((series, index) => ({
    ...series,
    color: index === 0 ? "#2f6ce5" : "#40b385",
  }));
  const topCategory = metrics.categories[0];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="h-28 animate-pulse rounded-2xl bg-slate-200"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-5 text-[15px]">
      <div className="pointer-events-none absolute -top-8 right-10 h-40 w-40 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute top-64 -left-10 h-44 w-44 rounded-full bg-emerald-200/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/70 px-4 py-3.5 shadow-sm">
        <span className="pointer-events-none absolute -right-12 -top-10 h-32 w-32 rounded-full bg-blue-100/80 blur-2xl" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-600 shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            </span>
            <h1 className="display-font text-[32px] font-semibold leading-tight tracking-tight text-slate-900">
              Inventory Management Dashboard
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">All Projects</option>
              {data.projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.name}
                </option>
              ))}
            </select>
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadDashboard({ silent: true })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded-lg px-4 py-2 text-[15px] font-medium ${
              activeTab === "overview"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className={`rounded-lg px-4 py-2 text-[15px] font-medium ${
              activeTab === "reports"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Reports
          </button>
        </div>
        <div className="flex items-center gap-1">
          <ActionIconButton>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </ActionIconButton>
          <ActionIconButton>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7 4h10v16H7z" />
              <path d="M10 4V2h4v2" />
            </svg>
          </ActionIconButton>
          <ActionIconButton>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16v12H4z" />
              <path d="M8 7V5h8v2" />
            </svg>
          </ActionIconButton>
          <ActionIconButton>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="6" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="18" cy="12" r="1.5" />
            </svg>
          </ActionIconButton>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {errors.slice(0, 2).join(" | ")}
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <SummaryCard
              title="Total Projects"
              value={metrics.cards.totalProjects.toLocaleString("en-IN")}
              trend={`+${metrics.cards.projectsThisMonth.toLocaleString("en-IN")}`}
              subtext="This Month"
              accentClass="from-blue-600 via-blue-500 to-cyan-400"
              iconWrapClass="bg-gradient-to-br from-blue-100 to-cyan-50 text-blue-600"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M8 3h8v4H8z" />
                  <path d="M5 7h14v14H5z" />
                  <path d="M9 11h6M9 15h4" />
                </svg>
              }
            />
            <SummaryCard
              title="BOQs Created"
              value={metrics.cards.totalBoqs.toLocaleString("en-IN")}
              trend={`+${metrics.cards.boqsThisMonth.toLocaleString("en-IN")}`}
              subtext="This Month"
              accentClass="from-indigo-600 via-blue-500 to-sky-400"
              iconWrapClass="bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-600"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M6 4h12v16H6z" />
                  <path d="M9 8h6M9 12h6M9 16h4" />
                </svg>
              }
            />
            <SummaryCard
              title="Pending Purchase Orders"
              value={metrics.cards.pendingOrders.toLocaleString("en-IN")}
              trend={formatCurrency(metrics.cards.pendingAmount)}
              subtext="Total Pending"
              accentClass="from-amber-500 via-orange-400 to-yellow-300"
              trendClass="text-amber-600"
              iconWrapClass="bg-gradient-to-br from-amber-100 to-orange-50 text-amber-600"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M7 5h10l1 4H6z" />
                  <path d="M6 9h12v10H6z" />
                  <path d="M10 13h4" />
                </svg>
              }
            />
            <SummaryCard
              title="Goods Delivered"
              value={metrics.cards.deliveredQty.toLocaleString("en-IN")}
              trend={`+${metrics.cards.deliveredThisMonth.toLocaleString("en-IN")}`}
              subtext="Items"
              accentClass="from-emerald-500 via-green-400 to-teal-300"
              iconWrapClass="bg-gradient-to-br from-emerald-100 to-green-50 text-emerald-600"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              }
              trailing={
                <svg viewBox="0 0 96 48" className="h-12 w-24">
                  <rect x="6" y="18" width="26" height="22" rx="2" fill="#d89b5d" />
                  <rect x="30" y="14" width="30" height="26" rx="2" fill="#efb27d" />
                  <rect x="56" y="20" width="34" height="20" rx="2" fill="#f4c89d" />
                  <path d="M18 18v22M44 14v26M72 20v20" stroke="#a86f3c" strokeWidth="1.2" />
                  <path d="M64 20h14l-4 8H60z" fill="#34d399" />
                </svg>
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-8">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div>
                    <h3 className="display-font text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
                      Inventory Status
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Consumption and receipts over the last 7 days
                    </p>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      {chartSeries.length === 0 ? (
                        <div className="grid h-60 place-items-center text-sm text-slate-500">
                          No inventory movement chart data yet.
                        </div>
                      ) : (
                        <>
                          <div className="flex h-56 items-end gap-2">
                            {metrics.chartDays.map((day, index) => (
                              <div
                                key={`day-${index}`}
                                className="flex flex-1 flex-col items-center justify-end"
                              >
                                <div className="flex h-44 w-full items-end justify-center gap-1.5">
                                  {chartSeries.map((series, seriesIndex) => {
                                    const value = day.values[seriesIndex] || 0;
                                    const height = value
                                      ? Math.max((value / metrics.chartMax) * 100, 8)
                                      : 0;
                                    return (
                                      <span
                                        key={`${series.id}-${index}`}
                                        className="w-[18px] rounded-t-md shadow-[0_3px_8px_rgba(30,64,175,0.15)]"
                                        style={{
                                          height: `${height}%`,
                                          backgroundColor: series.color,
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                                <span className="mt-2 text-xs text-slate-500">
                                  {day.label}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                            <div className="flex flex-wrap items-center gap-5">
                              {chartSeries.map((series) => (
                                <span key={series.id} className="inline-flex items-center gap-2">
                                  <span
                                    className="h-3 w-3 rounded-sm"
                                    style={{ backgroundColor: series.color }}
                                  />
                                  {series.label}
                                </span>
                              ))}
                            </div>
                            <span className="inline-flex items-center gap-2 text-slate-500">
                              <span className="inline-flex gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                              </span>
                              That 7 Days
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 p-4">
                      <p className="display-font text-lg font-semibold text-slate-800">Cost Summary</p>
                      <p className="mt-1 text-sm text-slate-600">Total Inventory Value</p>
                      <p className="mt-3 text-[42px] font-semibold leading-none tracking-tight text-slate-900">
                        {formatCurrency(metrics.cards.inventoryValue)}
                      </p>
                      <p className="mt-1 text-sm text-emerald-600">
                        +{metrics.cards.receivedThisMonth.toLocaleString("en-IN")} This Month
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 text-blue-600">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path d="M4 7h16v12H4z" />
                            <path d="M8 7V5h8v2" />
                            <path d="M8 12h8" />
                          </svg>
                        </span>
                        <p className="text-lg font-semibold">Items Received</p>
                      </div>
                      <p className="mt-2 text-[44px] font-semibold leading-none tracking-tight text-slate-900">
                        {metrics.cards.receivedQty.toLocaleString("en-IN")}
                      </p>
                      <p className="mt-2 text-sm text-emerald-600">
                        {metrics.cards.receivedGrowth >= 0 ? "+" : ""}
                        {metrics.cards.receivedGrowth.toFixed(1)}% vs last month
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <h3 className="display-font text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
                      Pending Purchase Orders
                    </h3>
                    <button
                      type="button"
                      onClick={() => navigate("/inventory/purchase-order-register")}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                    >
                      View All
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-slate-100/80 text-sm font-semibold text-slate-600">
                        <tr>
                          <th className="p-3 text-left">PO Number</th>
                          <th className="p-3 text-left">Vendor Name</th>
                          <th className="p-3 text-left">Location Site</th>
                          <th className="p-3 text-left">Date Created</th>
                          <th className="p-3 text-left">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePending.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="p-6 text-center text-slate-500">
                              No pending orders.
                            </td>
                          </tr>
                        ) : (
                          visiblePending.map((po) => (
                            <tr key={po.id} className="border-t border-slate-100 text-[14px] transition hover:bg-slate-50/80">
                              <td className="p-3 font-semibold text-slate-800">
                                {po.poNumber || `PO-${po.id}`}
                              </td>
                              <td className="p-3 text-slate-700">
                                {vendorMap[String(po.vendorId)]?.name || "-"}
                              </td>
                              <td className="p-3 text-slate-600">
                                {locationMap[String(po.locationId)]?.name || "-"}
                              </td>
                              <td className="p-3 text-slate-600">
                                {formatDate(po.orderDate || po.createdAt || po.expectedDate)}
                              </td>
                              <td className="p-3 font-semibold text-emerald-700">
                                {formatCurrency(po.total)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="display-font text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
                    Consumption by Category
                  </h3>
                  <div className="mt-4 grid place-items-center">
                    <div
                      className="relative h-56 w-56 rounded-full"
                      style={{ background: metrics.donutGradient }}
                    >
                      <div className="absolute inset-[28%] grid place-items-center rounded-full bg-white text-center">
                        <p className="text-sm text-slate-500">
                          {topCategory?.name || "No Data"}
                        </p>
                        <p className="text-3xl font-semibold text-slate-900">
                          {(topCategory?.percent ?? 0).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  {metrics.categories.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No category data available.</p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-700">
                      {metrics.categories.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span>{entry.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 xl:col-span-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="display-font text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
                    Inventory Activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => navigate("/inventory/receive-goods-register")}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200"
                  >
                    View All Activities
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleActivities.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No activities available.</p>
                  ) : (
                    visibleActivities.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-slate-50/70"
                      >
                        <span
                          className={`grid h-9 w-9 place-items-center rounded-full ${getActivityBadgeClass(entry.kind)}`}
                        >
                          {getActivityIcon(entry.kind)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium leading-tight text-slate-800">
                            {entry.title}
                          </p>
                          <p className="mt-1 text-[13px] text-slate-600">{entry.detail}</p>
                        </div>
                        <span className="shrink-0 pt-1 text-xs text-slate-400">
                          {formatActivityTime(entry.date)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="display-font text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
                    Recent Tradings
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reports")}
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    View All
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <div className="mt-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50 to-amber-50/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-amber-100 text-amber-600">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4 8h16v9H4z" />
                          <path d="M7 8V6h10v2M8 12h4" />
                        </svg>
                      </span>
                      <span className="text-[15px] font-medium">Item Material</span>
                    </div>
                    <span className="text-2xl font-semibold text-emerald-700">
                      {formatCurrency(metrics.finance.consumedValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-100 text-blue-600">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4 7h16v12H4z" />
                          <path d="M8 7V5h8v2M8 12h8M8 15h5" />
                        </svg>
                      </span>
                      <span className="text-[15px] font-medium">Items Purchases</span>
                    </div>
                    <span className="text-2xl font-semibold text-emerald-700">
                      {formatCurrency(metrics.finance.purchaseValue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-3xl font-semibold text-slate-800">Project Reports</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3 text-left">Project</th>
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-left">BOQs</th>
                <th className="p-3 text-left">Pending POs</th>
                <th className="p-3 text-left">Order Value</th>
                <th className="p-3 text-left">Received</th>
                <th className="p-3 text-left">Consumed</th>
              </tr>
            </thead>
            <tbody>
              {metrics.projectReportRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-slate-500">
                    No project report data available.
                  </td>
                </tr>
              ) : (
                metrics.projectReportRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                    <td className="p-3">{row.code}</td>
                    <td className="p-3">{row.boqs}</td>
                    <td className="p-3">{row.pending}</td>
                    <td className="p-3 font-semibold text-emerald-700">
                      {formatCurrency(row.value)}
                    </td>
                    <td className="p-3">{row.received}</td>
                    <td className="p-3">{row.consumed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
