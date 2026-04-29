import { buildMrpSnapshot } from "./mrpEngine";
import { normalizeProjectDate } from "./projectNormalization";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const severityRank = {
  critical: 4,
  warning: 3,
  success: 2,
  info: 1,
};

const isNonEmpty = (value) => String(value ?? "").trim().length > 0;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toLocalDate = (value, { endOfDay = false } = {}) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const normalized = normalizeProjectDate(value) || String(value).trim();
  if (!normalized) {
    return null;
  }

  const candidate = new Date(
    `${normalized}${endOfDay ? "T23:59:59" : "T00:00:00"}`
  );
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const hashText = (value = "") => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

const buildProjectLabel = (project = {}) =>
  project.name || project.code || `Project ${project.id ?? ""}`.trim() || "Project";

const buildOrderLabel = (order = {}) =>
  order.poNumber || order.purchaseOrderNumber || `PO-${order.id ?? ""}`.trim() || "Purchase Order";

const isCompletedStatus = (status) =>
  ["completed", "closed", "done", "finalized", "finalised"].includes(
    String(status || "").trim().toLowerCase()
  );

const isOpenStatus = (status) => !isCompletedStatus(status);

const hasFullyReceivedItems = (order = {}) => {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) {
    return false;
  }

  return items.every((item) => {
    const orderedQty = toNumber(item.quantity ?? item.orderedQty ?? item.totalQty);
    const receivedQty = toNumber(
      item.totalReceivedQty ?? item.receivedQty ?? item.received ?? 0
    );
    return orderedQty === 0 || receivedQty >= orderedQty;
  });
};

const makeNotification = ({
  id,
  type,
  title,
  message,
  severity = "info",
  createdAt,
  read = false,
  link = "/",
  entityId = "",
  data = {},
  source = "system",
}) => ({
  id: String(id),
  type,
  source,
  title,
  message,
  severity,
  createdAt:
    createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || new Date().toISOString()),
  read: Boolean(read),
  link,
  entityId,
  data: data && typeof data === "object" ? data : {},
});

const buildWorkspaceSignature = (settings = {}) =>
  hashText(
    JSON.stringify({
      profile: settings.profile || {},
      company: settings.company || {},
      preferences: settings.preferences || {},
    })
  );

const dedupeNotifications = (notifications = []) => {
  const uniqueById = new Map();

  notifications.forEach((notification) => {
    if (!notification.id) {
      return;
    }
    const existing = uniqueById.get(notification.id);
    if (!existing) {
      uniqueById.set(notification.id, notification);
      return;
    }

    const existingRank = severityRank[existing.severity] || 0;
    const nextRank = severityRank[notification.severity] || 0;
    if (nextRank > existingRank) {
      uniqueById.set(notification.id, notification);
      return;
    }

    if (
      nextRank === existingRank &&
      new Date(notification.createdAt).getTime() > new Date(existing.createdAt).getTime()
    ) {
      uniqueById.set(notification.id, notification);
    }
  });

  return Array.from(uniqueById.values()).sort((left, right) => {
    const rankDelta = (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
};

export const buildNotificationsFromState = ({
  projects = [],
  purchaseOrders = [],
  receiveGoods = [],
  items = [],
  boqs = [],
  consumptions = [],
  settings = {},
  now = new Date(),
  previousMeta = {},
} = {}) => {
  const notifications = [];
  const currentTime = now instanceof Date ? now : new Date(now);
  const reorderLevel = toNumber(
    settings?.inventory?.reorderLevel ?? settings?.inventory?.lowStockThreshold ?? 0
  );

  const workspaceSignature = buildWorkspaceSignature(settings);
  if (
    isNonEmpty(workspaceSignature) &&
    workspaceSignature !== String(previousMeta.workspaceSignature || "")
  ) {
    notifications.push(
      makeNotification({
        id: `workspace-sync-${workspaceSignature}`,
        type: "system",
        title: "Workspace Sync Complete",
        message: "Workspace profile and settings have been synchronized.",
        severity: "info",
        createdAt: currentTime,
        link: "/settings",
        entityId: "workspace-sync",
        data: {
          workspaceSignature,
        },
      })
    );
  }

  const projectLookup = new Map(
    (Array.isArray(projects) ? projects : []).map((project) => [
      String(project.id ?? ""),
      project,
    ])
  );

  const receiveLookupByOrderId = new Map();
  (Array.isArray(receiveGoods) ? receiveGoods : []).forEach((receipt) => {
    const purchaseOrderId = String(receipt.purchaseOrderId ?? "");
    if (!purchaseOrderId) {
      return;
    }
    const list = receiveLookupByOrderId.get(purchaseOrderId) || [];
    list.push(receipt);
    receiveLookupByOrderId.set(purchaseOrderId, list);
  });

  (Array.isArray(items) ? items : []).forEach((item) => {
    const stock = toNumber(item.stock ?? item.Stock ?? 0);
    if (!reorderLevel || !isNonEmpty(item.id)) {
      return;
    }

    if (stock <= reorderLevel) {
      notifications.push(
        makeNotification({
          id: `low-stock-${item.id}`,
          type: "inventory",
          title: "Low Stock Warning",
          message: `${item.name || "Product"} stock dropped below reorder level.`,
          severity:
            stock <= Math.max(1, Math.floor(reorderLevel / 2))
              ? "critical"
              : "warning",
          createdAt: currentTime,
          link: `/inventory/edit/${item.id}`,
          entityId: `item:${item.id}`,
          data: {
            productId: item.id,
            productName: item.name || "Product",
            currentStock: stock,
            reorderLevel,
          },
        })
      );
    }
  });

  (Array.isArray(receiveGoods) ? receiveGoods : []).forEach((receipt) => {
    const receiptDate = toLocalDate(receipt.receivedDate, { endOfDay: false });
    if (!receiptDate || currentTime < receiptDate) {
      return;
    }

    const project = projectLookup.get(String(receipt.projectId ?? ""));
    notifications.push(
      makeNotification({
        id: `inventory-ready-${receipt.id}`,
        type: "inventory",
        title: "Inventory Ready",
        message: `${
          project ? `${buildProjectLabel(project)} items` : "Inventory items"
        } have been received and are now available.`,
        severity: "success",
        createdAt: receiptDate,
        link: `/inventory/receive-goods?receiptId=${receipt.id}`,
        entityId: `receipt:${receipt.id}`,
        data: {
          receiptId: receipt.id,
          projectId: receipt.projectId ?? null,
          projectName: project ? buildProjectLabel(project) : "",
        },
      })
    );
  });

  (Array.isArray(purchaseOrders) ? purchaseOrders : []).forEach((order) => {
    const expectedDate = toLocalDate(order.expectedDate, { endOfDay: true });
    const project = projectLookup.get(String(order.projectId ?? ""));
    const receiptsForOrder = receiveLookupByOrderId.get(String(order.id ?? "")) || [];
    const hasReceivedGoods = receiptsForOrder.some((receipt) => {
      const receiptDate = toLocalDate(receipt.receivedDate, { endOfDay: false });
      return receiptDate && currentTime >= receiptDate;
    });

    if (
      expectedDate &&
      currentTime > expectedDate &&
      isOpenStatus(order.status) &&
      (!hasReceivedGoods || !hasFullyReceivedItems(order))
    ) {
      notifications.push(
        makeNotification({
          id: `delivery-delay-${order.id}`,
          type: "delivery",
          title: "Delivery Delayed",
          message: `Supplier delivery for ${buildOrderLabel(order)}${
            project ? ` on ${buildProjectLabel(project)}` : ""
          } is delayed.`,
          severity: "warning",
          createdAt: expectedDate,
          link: `/inventory/purchase-order-register`,
          entityId: `purchase-order:${order.id}`,
          data: {
            purchaseOrderId: order.id,
            poNumber: buildOrderLabel(order),
            projectId: order.projectId ?? null,
            projectName: project ? buildProjectLabel(project) : "",
            expectedDate: expectedDate.toISOString(),
          },
        })
      );
    }
  });

  (Array.isArray(projects) ? projects : []).forEach((project) => {
    const endDate = toLocalDate(project.endDate ?? project.deadline, {
      endOfDay: true,
    });
    if (!endDate) {
      return;
    }

    const projectOrders = purchaseOrders.filter(
      (order) => String(order.projectId ?? "") === String(project.id ?? "")
    );
    const hasOpenOrders = projectOrders.some((order) => isOpenStatus(order.status));
    const hasIncompleteOrders = projectOrders.some((order) => !hasFullyReceivedItems(order));
    const daysRemaining = Math.ceil((endDate.getTime() - currentTime.getTime()) / DAY_IN_MS);

    if (currentTime > endDate && String(project.status || "").trim().toLowerCase() !== "completed") {
      notifications.push(
        makeNotification({
          id: `project-deadline-${project.id}`,
          type: "project",
          title: "Project Deadline Passed",
          message: `Project deadline has passed. Inventory consumption should be finalized for ${buildProjectLabel(
            project
          )}.`,
          severity: "critical",
          createdAt: endDate,
          link: `/inventory/projects`,
          entityId: `project:${project.id}`,
          data: {
            projectId: project.id,
            projectName: buildProjectLabel(project),
            deadline: endDate.toISOString(),
          },
        })
      );
    } else if (daysRemaining <= 7 && daysRemaining >= 0 && (hasOpenOrders || hasIncompleteOrders)) {
      notifications.push(
        makeNotification({
          id: `project-risk-${project.id}`,
          type: "project",
          title: "Project Risk",
          message: `${buildProjectLabel(
            project
          )} may miss the deadline due to incomplete inventory allocation.`,
          severity: "warning",
          createdAt: currentTime,
          link: `/inventory/projects`,
          entityId: `project:${project.id}`,
          data: {
            projectId: project.id,
            projectName: buildProjectLabel(project),
            deadline: endDate.toISOString(),
            daysRemaining,
          },
        })
      );
    }

    const projectCompleted =
      String(project.status || "").trim().toLowerCase() === "completed" ||
      (projectOrders.length > 0 &&
        projectOrders.every((order) => isCompletedStatus(order.status) || hasFullyReceivedItems(order)));

    if (projectCompleted) {
      notifications.push(
        makeNotification({
          id: `inventory-complete-${project.id}`,
          type: "project",
          title: "Inventory Completed",
          message: `Inventory workflow completed successfully for ${buildProjectLabel(project)}.`,
          severity: "success",
          createdAt: currentTime,
          link: `/inventory/projects`,
          entityId: `project:${project.id}`,
          data: {
            projectId: project.id,
            projectName: buildProjectLabel(project),
          },
        })
      );
    }
  });

  const mrpSnapshot = buildMrpSnapshot({
    projects,
    boqs,
    items,
    purchaseOrders,
    consumptions,
    settings,
    now: currentTime,
  });

  mrpSnapshot.shortageResults.shortages.forEach((shortage) => {
    notifications.push(
      makeNotification({
        id: `mrp-shortage-${hashText(`${shortage.projectId}:${shortage.materialKey}`)}`,
        type: "mrp",
        title: "Material Shortage",
        message: `${shortage.productName} shortage detected for ${shortage.projectName}. Recommended order: ${shortage.recommendedOrder} ${shortage.unit}.`,
        severity: "critical",
        createdAt: currentTime,
        link: "/inventory/projects",
        entityId: `project:${shortage.projectId}`,
        data: {
          projectId: shortage.projectId,
          projectName: shortage.projectName,
          productId: shortage.productId,
          productName: shortage.productName,
          materialKey: shortage.materialKey,
          required: shortage.required,
          available: shortage.available,
          shortage: shortage.shortage,
          recommendedOrder: shortage.recommendedOrder,
          deadline: shortage.deadline,
        },
      })
    );
  });

  mrpSnapshot.forecast.atRisk.forEach((forecastItem) => {
    const daysRemaining = Math.max(1, Math.ceil(toNumber(forecastItem.daysRemaining)));
    notifications.push(
      makeNotification({
        id: `depletion-risk-${forecastItem.productId ?? forecastItem.materialKey}`,
        type: "forecast",
        title: "Depletion Risk",
        message: `${forecastItem.productName} may run out in about ${daysRemaining} day${
          daysRemaining === 1 ? "" : "s"
        }.`,
        severity: forecastItem.status === "critical" ? "critical" : "warning",
        createdAt: currentTime,
        link: forecastItem.productId
          ? `/inventory/edit/${encodeURIComponent(forecastItem.productId)}`
          : "/inventory",
        entityId: forecastItem.productId
          ? `item:${forecastItem.productId}`
          : `forecast:${forecastItem.materialKey}`,
        data: {
          productId: forecastItem.productId,
          productName: forecastItem.productName,
          materialKey: forecastItem.materialKey,
          currentStock: forecastItem.currentStock,
          incomingPurchaseOrders: forecastItem.incomingPurchaseOrders,
          averageDailyUsage: forecastItem.averageDailyUsage,
          daysRemaining: forecastItem.daysRemaining,
          depletionDate: forecastItem.depletionDate,
          status: forecastItem.status,
        },
      })
    );
  });

  return {
    notifications: dedupeNotifications(notifications),
    meta: {
      workspaceSignature,
      lastRefreshAt: currentTime.toISOString(),
    },
  };
};
