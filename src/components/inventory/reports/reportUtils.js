export const REPORT_ACTIVITY_TYPES = [
  {
    key: "boq",
    label: "BOQ",
    timelineLabel: "BOQ Created",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  {
    key: "purchase-order",
    label: "Purchase Orders",
    timelineLabel: "PO Created",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    dotClass: "bg-sky-500",
  },
  {
    key: "receive-goods",
    label: "Receive Goods",
    timelineLabel: "Goods Received",
    badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dotClass: "bg-indigo-500",
  },
  {
    key: "delivery-challan",
    label: "Delivery Challan",
    timelineLabel: "Delivery Challan",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  {
    key: "consumption",
    label: "Consumption",
    timelineLabel: "Consumed",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    dotClass: "bg-rose-500",
  },
];

const ACTIVITY_INDEX = REPORT_ACTIVITY_TYPES.reduce((acc, activity, index) => {
  acc[activity.key] = index;
  return acc;
}, {});

const activityMetaMap = REPORT_ACTIVITY_TYPES.reduce((acc, activity) => {
  acc[activity.key] = activity;
  return acc;
}, {});

const DASH_PLACEHOLDER = "-";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateObject = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (value) => {
  const date = toDateObject(value);
  if (!date) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const getTimeValue = (value) => {
  const date = toDateObject(value);
  return date ? date.getTime() : 0;
};

const formatTwoDigit = (value) => String(value).padStart(2, "0");

export const formatReportDate = (value, { withYear = false } = {}) => {
  const date = toDateObject(value);
  if (!date) {
    return DASH_PLACEHOLDER;
  }
  const month = date.toLocaleString("en-GB", { month: "short" });
  const day = formatTwoDigit(date.getDate());
  return withYear ? `${day}-${month}-${date.getFullYear()}` : `${day}-${month}`;
};

const buildReceiveRef = (receipt) => {
  const id = receipt?.receiveGoodsId ?? receipt?.id;
  if (!id) {
    return "RG";
  }
  return `RG-${String(id).padStart(3, "0")}`;
};

const buildFallbackRef = (prefix, value) => {
  if (!value) {
    return prefix;
  }
  return `${prefix}-${String(value).padStart(3, "0")}`;
};

const asNameMap = (records = []) =>
  records.reduce((acc, record) => {
    acc[String(record.id)] = record;
    return acc;
  }, {});

const createRow = ({
  activityKey,
  documentId,
  lineId,
  date,
  projectId,
  projectName,
  refNo,
  product,
  vendorId,
  vendorName,
  qty,
  location,
  status,
}) => {
  const activityMeta = activityMetaMap[activityKey] ?? REPORT_ACTIVITY_TYPES[0];
  return {
    id: `${activityKey}-${documentId ?? "record"}-${lineId ?? "line"}`,
    activityKey,
    activityLabel: activityMeta.label,
    activityTimelineLabel: activityMeta.timelineLabel,
    activityBadgeClass: activityMeta.badgeClass,
    activityDotClass: activityMeta.dotClass,
    activitySortIndex: ACTIVITY_INDEX[activityKey] ?? 0,
    date: date || null,
    dateKey: toDateKey(date),
    timeValue: getTimeValue(date),
    projectId: projectId ? String(projectId) : "",
    projectName: projectName || DASH_PLACEHOLDER,
    refNo: refNo || DASH_PLACEHOLDER,
    product: product || DASH_PLACEHOLDER,
    vendorId: vendorId ? String(vendorId) : "",
    vendorName: vendorName || DASH_PLACEHOLDER,
    qty: toNumber(qty),
    location: location || DASH_PLACEHOLDER,
    status: status || DASH_PLACEHOLDER,
  };
};

export const buildReportRows = ({
  boqs = [],
  purchaseOrders = [],
  receiveGoods = [],
  deliveryChallans = [],
  consumptions = [],
  projects = [],
  vendors = [],
  locations = [],
}) => {
  const projectMap = asNameMap(projects);
  const vendorMap = asNameMap(vendors);
  const locationMap = asNameMap(locations);
  const purchaseOrderMap = asNameMap(purchaseOrders);
  const rows = [];

  boqs.forEach((boq) => {
    const project = projectMap[String(boq.projectId)];
    (boq.items || []).forEach((item, index) => {
      rows.push(
        createRow({
          activityKey: "boq",
          documentId: boq.id,
          lineId: item.id ?? index,
          date: boq.date,
          projectId: boq.projectId,
          projectName: project?.name,
          refNo: boq.boqNumber || buildFallbackRef("BOQ", boq.id),
          product: item.name,
          qty: item.quantity,
          status: boq.status || "Draft",
        })
      );
    });
  });

  purchaseOrders.forEach((order) => {
    const project = projectMap[String(order.projectId)];
    const vendor = vendorMap[String(order.vendorId)];
    const location = locationMap[String(order.locationId)];
    (order.items || []).forEach((item, index) => {
      rows.push(
        createRow({
          activityKey: "purchase-order",
          documentId: order.id,
          lineId: item.poItemId ?? item.id ?? index,
          date: order.orderDate,
          projectId: order.projectId,
          projectName: project?.name,
          refNo: order.poNumber || buildFallbackRef("PO", order.id),
          product: item.name,
          vendorId: order.vendorId,
          vendorName: vendor?.name,
          qty: item.quantity,
          location: location?.name,
          status: order.status || "Draft",
        })
      );
    });
  });

  receiveGoods.forEach((receipt) => {
    const order = purchaseOrderMap[String(receipt.purchaseOrderId)];
    const projectId = receipt.projectId || order?.projectId;
    const vendorId = receipt.vendorId || order?.vendorId;
    const locationId = receipt.locationId || order?.locationId;
    const project = projectMap[String(projectId)];
    const vendor = vendorMap[String(vendorId)];
    const location = locationMap[String(locationId)];
    (receipt.items || []).forEach((item, index) => {
      rows.push(
        createRow({
          activityKey: "receive-goods",
          documentId: receipt.id,
          lineId: item.id ?? item.poItemId ?? index,
          date: receipt.receivedDate || receipt.createdAt,
          projectId,
          projectName: project?.name,
          refNo: buildReceiveRef(receipt),
          product: item.name,
          vendorId,
          vendorName: vendor?.name,
          qty: item.receivedQty,
          location: location?.name,
          status: receipt.status || order?.status || "Completed",
        })
      );
    });
  });

  deliveryChallans.forEach((challan) => {
    const project = projectMap[String(challan.projectId)];
    const fromLocation = locationMap[String(challan.fromLocationId)];
    (challan.items || []).forEach((item, index) => {
      rows.push(
        createRow({
          activityKey: "delivery-challan",
          documentId: challan.id,
          lineId: item.id ?? index,
          date: challan.issueDate || challan.createdAt,
          projectId: challan.projectId,
          projectName: project?.name,
          refNo: challan.dcNumber || buildFallbackRef("DC", challan.id),
          product: item.name,
          qty: item.quantity,
          location: challan.toLocation || fromLocation?.name,
          status: challan.status || "Draft",
        })
      );
    });
  });

  consumptions.forEach((consumption) => {
    const project = projectMap[String(consumption.projectId)];
    const location = locationMap[String(consumption.locationId)];
    (consumption.items || []).forEach((item, index) => {
      rows.push(
        createRow({
          activityKey: "consumption",
          documentId: consumption.id,
          lineId: item.id ?? index,
          date: consumption.consumptionDate || consumption.createdAt,
          projectId: consumption.projectId,
          projectName: project?.name,
          refNo:
            consumption.consumptionNumber ||
            buildFallbackRef("CN", consumption.consumptionId ?? consumption.id),
          product: item.name,
          qty: item.quantity,
          location: location?.name,
          status: consumption.status || "Logged",
        })
      );
    });
  });

  return rows.sort((left, right) => {
    if (left.timeValue !== right.timeValue) {
      return left.timeValue - right.timeValue;
    }
    if (left.activitySortIndex !== right.activitySortIndex) {
      return left.activitySortIndex - right.activitySortIndex;
    }
    return String(left.refNo).localeCompare(String(right.refNo));
  });
};

export const buildWorkflowStages = (rows = [], selectedActivityKeys = []) => {
  const enabledKeys = new Set(selectedActivityKeys);
  return REPORT_ACTIVITY_TYPES.filter((activity) => enabledKeys.has(activity.key)).map(
    (activity) => {
      const stageRows = rows.filter((row) => row.activityKey === activity.key);
      const totalQty = stageRows.reduce((sum, row) => sum + toNumber(row.qty), 0);
      const latestRow = stageRows[stageRows.length - 1] ?? null;
      return {
        ...activity,
        count: stageRows.length,
        totalQty,
        latestLabel: latestRow ? formatReportDate(latestRow.date) : "Pending",
        latestRefNo: latestRow?.refNo || "",
        isActive: stageRows.length > 0,
      };
    }
  );
};

export const getStatusBadgeClass = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (
    normalized.includes("approved") ||
    normalized.includes("completed") ||
    normalized.includes("closed") ||
    normalized.includes("delivered")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (
    normalized.includes("open") ||
    normalized.includes("issued") ||
    normalized.includes("reviewed")
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (
    normalized.includes("partial") ||
    normalized.includes("pending") ||
    normalized.includes("hold")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized.includes("draft") || normalized.includes("logged")) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  return "border-indigo-200 bg-indigo-50 text-indigo-700";
};

export const buildExcelRows = (rows = []) =>
  rows.map((row) => ({
    Date: formatReportDate(row.date, { withYear: true }),
    Project: row.projectName,
    Activity: row.activityLabel,
    "Ref No": row.refNo,
    Product: row.product,
    Vendor: row.vendorName,
    Qty: row.qty,
    Location: row.location,
    Status: row.status,
  }));

export const getUniqueStatuses = (rows = []) =>
  Array.from(
    new Set(
      rows
        .map((row) => String(row.status || "").trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

export const isRowWithinDateRange = (row, fromDate, toDate) => {
  if (!row?.dateKey) {
    return !fromDate && !toDate;
  }
  if (fromDate && row.dateKey < fromDate) {
    return false;
  }
  if (toDate && row.dateKey > toDate) {
    return false;
  }
  return true;
};
