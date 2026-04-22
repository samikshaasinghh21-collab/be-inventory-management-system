import { formatDate } from "../../../utils/dateFormat";

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
    label: "Goods Received",
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

const normalizeLookupText = (value) => String(value || "").trim().toLowerCase();

const appendQuantityToMap = (map, key, quantity) => {
  if (!key) {
    return;
  }
  map.set(key, toNumber(map.get(key)) + toNumber(quantity));
};

const createOrderItemKeys = (purchaseOrderId, item = {}, index = 0) => {
  const normalizedName = normalizeLookupText(item.name ?? item.ItemName);
  const directPoItemId =
    item.poItemId ?? item.purchaseOrderItemId ?? item.PurchaseOrderItemId ?? null;
  return [
    directPoItemId ? `po:${directPoItemId}` : null,
    !directPoItemId && item.id ? `po:${item.id}` : null,
    purchaseOrderId && item.itemId ? `order:${purchaseOrderId}:item:${item.itemId}` : null,
    purchaseOrderId && normalizedName
      ? `order:${purchaseOrderId}:name:${normalizedName}`
      : null,
    purchaseOrderId ? `order:${purchaseOrderId}:index:${index}` : null,
  ].filter(Boolean);
};

const resolveQtyByKeys = (map, keys = []) => {
  for (const key of keys) {
    if (map.has(key)) {
      return toNumber(map.get(key));
    }
  }
  return 0;
};

const buildReceivedTotalsByOrderItemKey = (receiveGoods = []) => {
  const totals = new Map();
  receiveGoods.forEach((receipt) => {
    (receipt.items || []).forEach((item, index) => {
      const receivedQty = toNumber(item.receivedQty);
      if (receivedQty <= 0) {
        return;
      }
      createOrderItemKeys(receipt.purchaseOrderId, item, index).forEach((key) => {
        appendQuantityToMap(totals, key, receivedQty);
      });
    });
  });
  return totals;
};

const buildReceivedTotalsByBoqItemId = (
  purchaseOrders = [],
  receivedTotalsByOrderItemKey = new Map()
) => {
  const totals = new Map();
  purchaseOrders.forEach((order) => {
    (order.items || []).forEach((item, index) => {
      if (!item.boqItemId) {
        return;
      }
      const receivedQty = resolveQtyByKeys(
        receivedTotalsByOrderItemKey,
        createOrderItemKeys(order.id, item, index)
      );
      if (receivedQty <= 0) {
        return;
      }
      appendQuantityToMap(totals, `boq:${item.boqItemId}`, receivedQty);
    });
  });
  return totals;
};

export const formatReportDate = (value) => formatDate(value);

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
  totalQty = null,
  receivedQty = null,
  availableQty = null,
  balanceQty = null,
  location,
  status,
}) => {
  const activityMeta = activityMetaMap[activityKey] ?? REPORT_ACTIVITY_TYPES[0];
  const hasTotalQty =
    totalQty !== null && totalQty !== undefined && totalQty !== "";
  const hasReceivedQty =
    receivedQty !== null && receivedQty !== undefined && receivedQty !== "";
  const hasAvailableQty =
    availableQty !== null && availableQty !== undefined && availableQty !== "";
  const hasBalanceQty =
    balanceQty !== null && balanceQty !== undefined && balanceQty !== "";
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
    totalQty: hasTotalQty ? toNumber(totalQty) : null,
    receivedQty: hasReceivedQty ? toNumber(receivedQty) : null,
    availableQty: hasAvailableQty ? toNumber(availableQty) : null,
    balanceQty: hasBalanceQty ? toNumber(balanceQty) : null,
    location: location || DASH_PLACEHOLDER,
    status: status || DASH_PLACEHOLDER,
  };
};

const createReceiveItemLookup = (receiveGoods = []) => {
  const lookup = new Map();
  receiveGoods.forEach((receipt) => {
    (receipt.items || []).forEach((item) => {
      const itemId = item.id ?? item.receiveGoodsItemId ?? item.ItemId ?? null;
      if (itemId === null || itemId === undefined || itemId === "") {
        return;
      }
      lookup.set(String(itemId), { receipt, item });
    });
  });
  return lookup;
};

const getConsumptionMetricKey = (consumption, item, index) =>
  `${consumption.id ?? consumption.consumptionId ?? "record"}::${
    item.id ?? item.receiveGoodsItemId ?? index
  }`;

const buildConsumptionReceiptMetrics = (consumptions = [], receiveGoods = []) => {
  const receiptItemLookup = createReceiveItemLookup(receiveGoods);
  const consumptionTracker = new Map();
  const metrics = new Map();

  const orderedConsumptions = [...(Array.isArray(consumptions) ? consumptions : [])].sort(
    (left, right) => {
      const leftTime = getTimeValue(left.consumptionDate || left.createdAt);
      const rightTime = getTimeValue(right.consumptionDate || right.createdAt);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return toNumber(left.id ?? left.consumptionId) - toNumber(right.id ?? right.consumptionId);
    }
  );

  orderedConsumptions.forEach((consumption) => {
    (consumption.items || []).forEach((item, index) => {
      const receiptItemId = item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? null;
      if (receiptItemId === null || receiptItemId === undefined || receiptItemId === "") {
        return;
      }

      const source = receiptItemLookup.get(String(receiptItemId));
      if (!source) {
        return;
      }

      const sourceReceivedQty = toNumber(source.item.receivedQty ?? source.item.ReceivedQty);
      const sourceConsumedQty = toNumber(consumptionTracker.get(String(receiptItemId)));
      const availableQty = Math.max(sourceReceivedQty - sourceConsumedQty, 0);
      const movementQty = toNumber(item.quantity);

      metrics.set(getConsumptionMetricKey(consumption, item, index), {
        receivedQty: sourceReceivedQty,
        availableQty,
        balanceQty: Math.max(availableQty - movementQty, 0),
      });

      consumptionTracker.set(
        String(receiptItemId),
        sourceConsumedQty + movementQty
      );
    });
  });

  return metrics;
};

const buildDeliveryChallanMaterialKey = (item = {}) => {
  const normalizedName = normalizeLookupText(
    item.name ?? item.ItemName ?? item.item ?? item.Item ?? ""
  );
  if (!normalizedName) {
    return "";
  }
  const normalizedUnit =
    normalizeLookupText(item.unit ?? item.Unit ?? "PCS") || "pcs";
  return `${normalizedName}::${normalizedUnit}`;
};

const buildDeliveryChallanGroups = (items = []) => {
  const groups = new Map();
  const receiveGoodsItemIdToMaterialKey = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const materialKey = buildDeliveryChallanMaterialKey(item);
    if (!materialKey) {
      return;
    }

    if (!groups.has(materialKey)) {
      groups.set(materialKey, {
        materialKey,
        name: item.name ?? item.ItemName ?? "Item",
        unit: item.unit ?? item.Unit ?? "PCS",
        deliveredQty: 0,
        consumedQty: 0,
      });
    }

    groups.get(materialKey).deliveredQty += toNumber(item.quantity ?? item.Quantity);

    const receiveGoodsItemId = toNumber(
      item.receiveGoodsItemId ?? item.ReceiveGoodsItemId ?? item.id ?? item.Id
    );
    if (Number.isFinite(receiveGoodsItemId) && receiveGoodsItemId > 0) {
      receiveGoodsItemIdToMaterialKey.set(receiveGoodsItemId, materialKey);
    }
  });

  return {
    groups,
    receiveGoodsItemIdToMaterialKey,
  };
};

const resolveDeliveryChallanMaterialKey = (
  item = {},
  groups = new Map(),
  receiveGoodsItemIdToMaterialKey = new Map()
) => {
  const receiveGoodsItemId = toNumber(
    item.receiveGoodsItemId ?? item.ReceiveGoodsItemId
  );
  if (
    Number.isFinite(receiveGoodsItemId) &&
    receiveGoodsItemId > 0 &&
    receiveGoodsItemIdToMaterialKey.has(receiveGoodsItemId)
  ) {
    return receiveGoodsItemIdToMaterialKey.get(receiveGoodsItemId);
  }

  const materialKey = buildDeliveryChallanMaterialKey(item);
  return materialKey && groups.has(materialKey) ? materialKey : null;
};

const isConsumptionLinkedToDeliveryChallan = (consumption = {}, challan = {}) => {
  const challanId = toNumber(challan.id ?? challan.deliveryChallanId);
  const consumptionChallanId = toNumber(
    consumption.deliveryChallanId ?? consumption.DeliveryChallanId
  );
  if (challanId > 0 && consumptionChallanId > 0 && challanId === consumptionChallanId) {
    return true;
  }

  const challanRef = normalizeLookupText(challan.dcNumber ?? challan.DCNumber ?? "");
  const consumptionRef = normalizeLookupText(
    consumption.deliveryChallanRef ?? consumption.DeliveryChallanRef ?? ""
  );
  return Boolean(challanRef && consumptionRef && challanRef === consumptionRef);
};

const buildConsumptionDeliveryMetrics = (consumptions = [], deliveryChallans = []) => {
  const challanLookup = new Map();
  (Array.isArray(deliveryChallans) ? deliveryChallans : []).forEach((challan) => {
    const challanKey = String(challan.id ?? challan.deliveryChallanId ?? "").trim();
    if (!challanKey) {
      return;
    }
    challanLookup.set(challanKey, {
      challan,
      ...buildDeliveryChallanGroups(challan.items || []),
    });
  });

  const metrics = new Map();
  const trackerByChallanKey = new Map();
  const orderedConsumptions = [...(Array.isArray(consumptions) ? consumptions : [])].sort(
    (left, right) => {
      const leftTime = getTimeValue(left.consumptionDate || left.createdAt);
      const rightTime = getTimeValue(right.consumptionDate || right.createdAt);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return toNumber(left.id ?? left.consumptionId) - toNumber(right.id ?? right.consumptionId);
    }
  );

  orderedConsumptions.forEach((consumption) => {
    const linkedChallan =
      challanLookup.get(
        String(consumption.deliveryChallanId ?? consumption.DeliveryChallanId ?? "").trim()
      ) ??
      Array.from(challanLookup.values()).find((entry) =>
        isConsumptionLinkedToDeliveryChallan(consumption, entry.challan)
      ) ??
      null;

    if (!linkedChallan) {
      return;
    }

    const trackerKey = String(
      linkedChallan.challan.id ?? linkedChallan.challan.deliveryChallanId ?? ""
    ).trim();
    const tracker = trackerByChallanKey.get(trackerKey) ?? new Map();

    (consumption.items || []).forEach((item, index) => {
      const materialKey = resolveDeliveryChallanMaterialKey(
        item,
        linkedChallan.groups,
        linkedChallan.receiveGoodsItemIdToMaterialKey
      );
      if (!materialKey) {
        return;
      }

      const group = linkedChallan.groups.get(materialKey);
      const consumedBefore = toNumber(tracker.get(materialKey));
      const movementQty = toNumber(item.quantity);
      const totalConsumed = consumedBefore + movementQty;

      metrics.set(getConsumptionMetricKey(consumption, item, index), {
        receivedQty: group?.deliveredQty ?? 0,
        availableQty: Math.max((group?.deliveredQty ?? 0) - consumedBefore, 0),
        balanceQty: Math.max((group?.deliveredQty ?? 0) - totalConsumed, 0),
      });

      tracker.set(materialKey, totalConsumed);
    });

    trackerByChallanKey.set(trackerKey, tracker);
  });

  return metrics;
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
  const receivedTotalsByOrderItemKey = buildReceivedTotalsByOrderItemKey(receiveGoods);
  const receivedTotalsByBoqItemId = buildReceivedTotalsByBoqItemId(
    purchaseOrders,
    receivedTotalsByOrderItemKey
  );
  const consumptionDeliveryMetrics = buildConsumptionDeliveryMetrics(
    consumptions,
    deliveryChallans
  );
  const consumptionReceiptMetrics = buildConsumptionReceiptMetrics(
    consumptions,
    receiveGoods
  );
  const rows = [];

  boqs.forEach((boq) => {
    const project = projectMap[String(boq.projectId)];
    (boq.items || []).forEach((item, index) => {
      const receivedQty = item.id
        ? resolveQtyByKeys(receivedTotalsByBoqItemId, [`boq:${item.id}`])
        : 0;
      const hasAvailableQty =
        item.availableQty !== null &&
        item.availableQty !== undefined &&
        item.availableQty !== "";
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
          totalQty: item.quantity,
          receivedQty,
          availableQty: hasAvailableQty
            ? item.availableQty
            : Math.max(toNumber(item.quantity) - toNumber(item.consumedQty), 0),
          balanceQty: hasAvailableQty
            ? item.availableQty
            : Math.max(toNumber(item.quantity) - toNumber(item.consumedQty), 0),
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
      const orderedQty = toNumber(
        item.orderedQty ?? item.quantity ?? item.Quantity ?? item.Qty
      );
      const receivedQty = toNumber(
        item.totalReceivedQty ?? item.receivedQty ?? item.ReceivedQty
      );
      const rawAvailableQty =
        item.totalAvailableQty ?? item.availableQty ?? item.AvailableQty;
      const availableQty =
        rawAvailableQty === null || rawAvailableQty === undefined || rawAvailableQty === ""
          ? receivedQty
          : toNumber(rawAvailableQty);
      const rawBalanceQty =
        item.totalPoBalanceQty ??
        item.poBalanceQty ??
        item.balanceQty ??
        item.BalanceQty;
      const balanceQty =
        rawBalanceQty === null || rawBalanceQty === undefined || rawBalanceQty === ""
          ? Math.max(orderedQty - receivedQty, 0)
          : toNumber(rawBalanceQty);
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
          totalQty: orderedQty,
          receivedQty,
          availableQty,
          balanceQty,
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
      const orderedQty = item.orderedQty ?? item.quantity ?? null;
      const movementQty = item.receiptReceivedQty ?? item.receivedQty;
      const receivedQty = item.totalReceivedQty ?? item.receivedQty;
      const availableQty =
        item.totalAvailableQty ??
        item.availableQty ??
        item.receiptAvailableQty ??
        item.receivedQty;
      const balanceQty =
        item.totalPoBalanceQty ??
        item.poBalanceQty ??
        item.balanceQty ??
        (orderedQty === null
          ? null
          : Math.max(toNumber(orderedQty) - toNumber(receivedQty), 0));
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
          qty: movementQty,
          totalQty: orderedQty,
          receivedQty,
          availableQty,
          balanceQty,
          location: location?.name,
          status: receipt.status || order?.status || "Received",
        })
      );
    });
  });

  deliveryChallans.forEach((challan) => {
    const project = projectMap[String(challan.projectId)];
    const fromLocation = locationMap[String(challan.fromLocationId)];
    const toLocation = locationMap[String(challan.toLocationId)];
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
          totalQty: item.quantity,
          location: toLocation?.name || challan.toLocation || fromLocation?.name,
          status: challan.status || "Draft",
        })
      );
    });
  });

  consumptions.forEach((consumption) => {
    const project = projectMap[String(consumption.projectId)];
    const location = locationMap[String(consumption.locationId)];
    (consumption.items || []).forEach((item, index) => {
      const deliveryMetric = consumptionDeliveryMetrics.get(
        getConsumptionMetricKey(consumption, item, index)
      );
      const receiptMetric = consumptionReceiptMetrics.get(
        getConsumptionMetricKey(consumption, item, index)
      );
      const metric = deliveryMetric ?? receiptMetric ?? null;
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
          totalQty: item.quantity,
          receivedQty: metric?.receivedQty ?? null,
          availableQty: metric?.availableQty ?? null,
          balanceQty: metric?.balanceQty ?? null,
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
      const totalReceivedQty = stageRows.reduce(
        (sum, row) => sum + toNumber(row.receivedQty),
        0
      );
      const totalAvailableQty = stageRows.reduce(
        (sum, row) => sum + toNumber(row.availableQty),
        0
      );
      const totalBalanceQty = stageRows.reduce(
        (sum, row) => sum + toNumber(row.balanceQty),
        0
      );
      const latestRow = stageRows[stageRows.length - 1] ?? null;
      return {
        ...activity,
        count: stageRows.length,
        totalQty,
        totalReceivedQty,
        totalAvailableQty,
        totalBalanceQty,
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
    Date: formatReportDate(row.date),
    Project: row.projectName,
    Activity: row.activityLabel,
    "Ref No": row.refNo,
    Product: row.product,
    Vendor: row.vendorName,
    "Movement Qty": row.qty,
    "Total Qty": row.totalQty ?? DASH_PLACEHOLDER,
    "Received Qty": row.receivedQty ?? DASH_PLACEHOLDER,
    "Available Qty": row.availableQty ?? DASH_PLACEHOLDER,
    "Balance Qty": row.balanceQty ?? DASH_PLACEHOLDER,
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
