const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FORECAST_LOOKBACK_DAYS = 30;
const CRITICAL_FORECAST_WINDOW_DAYS = 7;
const WARNING_FORECAST_WINDOW_DAYS = 14;

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundQuantity = (value) => Number(toNumber(value).toFixed(2));
const roundUnitPrice = (value) => Math.round(toNumber(value));

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoDate = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
};

const createHash = (value = "") => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

const compareDates = (left, right) => {
  const leftTime = parseDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = parseDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
};

const compareByRecentDate = (left, right) => {
  const leftTime = parseDate(
    left.updatedAt ?? left.orderDate ?? left.receivedDate ?? left.createdAt ?? left.date
  )?.getTime() ?? 0;
  const rightTime = parseDate(
    right.updatedAt ?? right.orderDate ?? right.receivedDate ?? right.createdAt ?? right.date
  )?.getTime() ?? 0;
  return rightTime - leftTime;
};

const isClosedStatus = (status) =>
  ["closed", "cancelled", "canceled", "completed", "done", "finalized", "finalised"].includes(
    normalizeText(status)
  );

const isCompletedProject = (project = {}) =>
  ["completed", "closed", "done"].includes(normalizeText(project.status));

const getProjectDeadline = (project = {}) =>
  parseDate(project.deadline ?? project.endDate ?? project.targetDate ?? null);

const getProjectLabel = (project = {}) =>
  project.name || project.code || `Project ${project.id ?? ""}`.trim() || "Project";

const getVendorLabel = (vendor = {}) =>
  vendor.name || vendor.vendorName || vendor.VendorName || "Suggested supplier";

const getMaterialLabel = (material = {}) =>
  material.productName ||
  material.name ||
  material.itemName ||
  material.description ||
  "Material";

const getMaterialUnit = (material = {}) => material.unit || material.salesUnit || "PCS";

const getStatusWeight = (status) => {
  const normalized = normalizeText(status);
  if (normalized === "approved") return 4;
  if (normalized === "active") return 3;
  if (normalized === "draft") return 2;
  if (normalized === "closed") return 1;
  return 0;
};

const buildNameKey = (value) => normalizeText(value).replace(/\s+/g, " ");

const buildMaterialSignature = (material = {}) => {
  const name = buildNameKey(
    material.name ?? material.productName ?? material.itemName ?? material.description ?? ""
  );
  const unit = normalizeText(getMaterialUnit(material));
  const hsn = normalizeText(material.hsn);
  return `${name}::${unit}::${hsn}`;
};

const cloneIncomingOrder = (order = {}) => ({
  ...order,
  quantity: roundQuantity(order.quantity),
  remainingQty: roundQuantity(order.quantity),
});

const createInventoryResolver = (items = []) => {
  const byId = new Map();
  const bySignature = new Map();
  const byName = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = {
      ...item,
      id: item.id ?? item.ItemId ?? null,
      name: item.name ?? item.Name ?? "",
      unit: item.unit ?? item.salesUnit ?? item.Unit ?? "PCS",
      hsn: item.hsn ?? item.HSN ?? "",
      stock: toNumber(item.stock ?? item.currentStock ?? item.Stock ?? 0),
      price: roundUnitPrice(item.price ?? item.Price ?? 0),
      gst: item.gst ?? item.GST ?? "",
      taxPercentage: toNumber(item.taxPercentage ?? item.TaxPercentage ?? 0),
      locationId: item.locationId ?? item.LocationId ?? null,
      locationName: item.locationName ?? item.location ?? item.Location ?? "",
      reOrderLevel: toNumber(item.reOrderLevel ?? item.reorderLevel ?? item.ReOrderLevel ?? 0),
      currentStock: toNumber(item.currentStock ?? item.stock ?? item.Stock ?? 0),
    };

    const signature = buildMaterialSignature(normalized);
    const nameKey = buildNameKey(normalized.name);

    if (normalized.id !== null && normalized.id !== undefined && normalized.id !== "") {
      byId.set(String(normalized.id), normalized);
    }

    if (signature && !bySignature.has(signature)) {
      bySignature.set(signature, normalized);
    }

    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, normalized);
    }
  });

  const resolve = (material = {}) => {
    const directId = material.productId ?? material.itemId ?? material.ItemId ?? null;
    if (directId !== null && directId !== undefined && byId.has(String(directId))) {
      return byId.get(String(directId));
    }

    const signature = buildMaterialSignature(material);
    if (signature && bySignature.has(signature)) {
      return bySignature.get(signature);
    }

    const nameKey = buildNameKey(
      material.name ?? material.productName ?? material.itemName ?? material.description ?? ""
    );
    return nameKey ? byName.get(nameKey) ?? null : null;
  };

  return {
    resolve,
    list: Array.from(byId.values()),
  };
};

const getMaterialKey = (material = {}, resolvedItem = null) => {
  if (resolvedItem?.id !== null && resolvedItem?.id !== undefined && resolvedItem?.id !== "") {
    return `product:${resolvedItem.id}`;
  }

  if (material.productId !== null && material.productId !== undefined && material.productId !== "") {
    return `product:${material.productId}`;
  }

  return `material:${buildMaterialSignature(material) || createHash(JSON.stringify(material || {}))}`;
};

const buildBaseMaterial = (material = {}, resolvedItem = null) => ({
  materialKey: getMaterialKey(material, resolvedItem),
  productId:
    resolvedItem?.id ??
    material.productId ??
    material.itemId ??
    material.ItemId ??
    null,
  productName: getMaterialLabel(resolvedItem || material),
  unit: getMaterialUnit(resolvedItem || material),
  hsn: resolvedItem?.hsn ?? material.hsn ?? "",
  gst:
    resolvedItem?.gst ??
    material.gst ??
    (toNumber(resolvedItem?.taxPercentage ?? material.taxPercentage) > 0
      ? `${toNumber(resolvedItem?.taxPercentage ?? material.taxPercentage)}%`
      : ""),
  price: roundUnitPrice(resolvedItem?.price ?? material.rate ?? material.unitPrice ?? 0),
  locationId: resolvedItem?.locationId ?? material.locationId ?? null,
  locationName: resolvedItem?.locationName ?? material.locationName ?? material.location ?? "",
});

const pickLatestBoqByProject = (boqs = []) => {
  const latestByProject = new Map();

  (Array.isArray(boqs) ? boqs : []).forEach((boq) => {
    const projectId = String(boq.projectId ?? "");
    if (!projectId) {
      return;
    }

    const current = latestByProject.get(projectId);
    if (!current) {
      latestByProject.set(projectId, boq);
      return;
    }

    const weightDelta = getStatusWeight(boq.status) - getStatusWeight(current.status);
    if (weightDelta > 0) {
      latestByProject.set(projectId, boq);
      return;
    }

    if (weightDelta === 0) {
      const versionDelta = toNumber(boq.version) - toNumber(current.version);
      if (versionDelta > 0) {
        latestByProject.set(projectId, boq);
        return;
      }

      if (versionDelta === 0 && compareByRecentDate(boq, current) < 0) {
        latestByProject.set(projectId, boq);
      }
    }
  });

  return latestByProject;
};

const buildDirectProjectMaterials = (project = {}) =>
  Array.isArray(project.materialsRequired)
    ? project.materialsRequired.map((item) => ({
        productId: item.productId ?? null,
        name: item.name ?? item.productName ?? item.productId ?? "",
        quantity: toNumber(item.quantity),
        unit: item.unit ?? "PCS",
        hsn: item.hsn ?? "",
        gst: item.gst ?? "",
      }))
    : [];

export const calculateProjectRequirements = ({
  projects = [],
  boqs = [],
  consumptions = [],
  items = [],
} = {}) => {
  const inventoryResolver = createInventoryResolver(items);
  const latestBoqs = pickLatestBoqByProject(boqs);
  const consumedByProjectMaterial = new Map();

  (Array.isArray(consumptions) ? consumptions : []).forEach((record) => {
    const projectId = record.projectId ?? null;
    if (projectId === null || projectId === undefined || projectId === "") {
      return;
    }

    (record.items || []).forEach((item) => {
      const resolvedItem = inventoryResolver.resolve(item);
      const materialKey = getMaterialKey(item, resolvedItem);
      const key = `${projectId}::${materialKey}`;
      consumedByProjectMaterial.set(
        key,
        roundQuantity(consumedByProjectMaterial.get(key) + toNumber(item.quantity))
      );
    });
  });

  const projectPlans = (Array.isArray(projects) ? projects : [])
    .filter((project) => !isCompletedProject(project))
    .map((project) => {
      const deadline = getProjectDeadline(project);
      const boq = latestBoqs.get(String(project.id ?? ""));
      const sourceMaterials =
        Array.isArray(boq?.items) && boq.items.length
          ? boq.items
          : buildDirectProjectMaterials(project);

      const materials = sourceMaterials
        .map((material) => {
          const resolvedItem = inventoryResolver.resolve(material);
          const base = buildBaseMaterial(material, resolvedItem);
          const plannedQuantity = roundQuantity(toNumber(material.quantity));
          const consumedQuantity = roundQuantity(
            consumedByProjectMaterial.get(`${project.id}::${base.materialKey}`)
          );
          const remainingRequired = roundQuantity(
            Math.max(plannedQuantity - consumedQuantity, 0)
          );

          return {
            id: `${project.id}-${base.materialKey}`,
            ...base,
            projectId: project.id,
            projectName: getProjectLabel(project),
            projectCode: project.code || "",
            deadline: toIsoDate(deadline),
            plannedQuantity,
            consumedQuantity,
            remainingRequired,
            required: remainingRequired,
          };
        })
        .filter((material) => material.plannedQuantity > 0 || material.required > 0);

      return {
        projectId: project.id,
        projectName: getProjectLabel(project),
        projectCode: project.code || "",
        deadline: toIsoDate(deadline),
        deadlineDate: deadline,
        boqId: boq?.id ?? null,
        boqNumber: boq?.boqNumber ?? "",
        materials,
        totalPlannedQuantity: roundQuantity(
          materials.reduce((sum, material) => sum + material.plannedQuantity, 0)
        ),
        totalConsumedQuantity: roundQuantity(
          materials.reduce((sum, material) => sum + material.consumedQuantity, 0)
        ),
        totalRequiredQuantity: roundQuantity(
          materials.reduce((sum, material) => sum + material.required, 0)
        ),
      };
    });

  return {
    projects: projectPlans,
    materials: projectPlans.flatMap((project) => project.materials),
  };
};

export const calculateInventoryAvailability = ({
  items = [],
  purchaseOrders = [],
} = {}) => {
  const inventoryResolver = createInventoryResolver(items);
  const inventoryMap = new Map();

  const ensureEntry = (material = {}, resolvedItem = null) => {
    const base = buildBaseMaterial(material, resolvedItem);
    const existing = inventoryMap.get(base.materialKey);
    if (existing) {
      return existing;
    }

    const next = {
      ...base,
      currentStock: roundQuantity(
        toNumber(resolvedItem?.stock ?? resolvedItem?.currentStock ?? material.currentStock ?? 0)
      ),
      incomingPurchaseOrders: 0,
      totalAvailable: roundQuantity(
        toNumber(resolvedItem?.stock ?? resolvedItem?.currentStock ?? material.currentStock ?? 0)
      ),
      incomingOrders: [],
    };
    inventoryMap.set(base.materialKey, next);
    return next;
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    ensureEntry(item, item);
  });

  (Array.isArray(purchaseOrders) ? purchaseOrders : [])
    .filter((order) => !isClosedStatus(order.status))
    .forEach((order) => {
      (order.items || []).forEach((item) => {
        const remainingQuantity = roundQuantity(
          Math.max(
            toNumber(
              item.poBalanceQty ??
                item.totalPoBalanceQty ??
                item.quantity - item.receivedQty
            ),
            0
          )
        );

        if (remainingQuantity <= 0) {
          return;
        }

        const resolvedItem = inventoryResolver.resolve(item);
        const entry = ensureEntry(item, resolvedItem);
        entry.incomingPurchaseOrders = roundQuantity(
          entry.incomingPurchaseOrders + remainingQuantity
        );
        entry.totalAvailable = roundQuantity(
          entry.currentStock + entry.incomingPurchaseOrders
        );
        entry.incomingOrders.push(
          cloneIncomingOrder({
            id: `${order.id}-${item.id ?? item.poItemId ?? item.name}`,
            purchaseOrderId: order.id,
            poNumber: order.poNumber || "",
            vendorId: order.vendorId ?? null,
            locationId: order.locationId ?? null,
            quantity: remainingQuantity,
            unitPrice: roundUnitPrice(item.unitPrice ?? item.rate),
            expectedDate: order.expectedDate ?? null,
            projectId: order.projectId ?? null,
          })
        );
      });
    });

  const materials = Array.from(inventoryMap.values()).map((entry) => ({
    ...entry,
    incomingOrders: [...entry.incomingOrders].sort((left, right) =>
      compareDates(left.expectedDate, right.expectedDate)
    ),
  }));

  return {
    materials,
    materialMap: new Map(materials.map((material) => [material.materialKey, material])),
  };
};

export const detectMaterialShortages = ({
  projectRequirements = { projects: [] },
  inventoryAvailability = { materialMap: new Map() },
} = {}) => {
  const linesByMaterial = new Map();
  const inventoryMap =
    inventoryAvailability.materialMap instanceof Map
      ? inventoryAvailability.materialMap
      : new Map();

  (projectRequirements.projects || []).forEach((project) => {
    (project.materials || []).forEach((material) => {
      if (material.required <= 0) {
        return;
      }

      if (!linesByMaterial.has(material.materialKey)) {
        linesByMaterial.set(material.materialKey, []);
      }
      linesByMaterial.get(material.materialKey).push({
        ...material,
        deadlineDate: project.deadlineDate,
      });
    });
  });

  const projectSummaries = new Map();
  const materialSummaries = new Map();
  const shortageLines = [];

  linesByMaterial.forEach((materials, materialKey) => {
    const inventoryEntry = inventoryMap.get(materialKey) || {
      materialKey,
      currentStock: 0,
      incomingPurchaseOrders: 0,
      incomingOrders: [],
    };

    let currentStockRemaining = roundQuantity(inventoryEntry.currentStock);
    const incomingOrders = (inventoryEntry.incomingOrders || []).map(cloneIncomingOrder);

    const orderedMaterials = [...materials].sort((left, right) => {
      const deadlineDelta = compareDates(left.deadlineDate, right.deadlineDate);
      if (deadlineDelta !== 0) {
        return deadlineDelta;
      }
      return String(left.projectName).localeCompare(String(right.projectName));
    });

    orderedMaterials.forEach((material) => {
      const visibleCurrentStock = currentStockRemaining;
      const eligibleIncomingBeforeDeadline = incomingOrders.filter((order) => {
        if (!material.deadlineDate) {
          return order.remainingQty > 0;
        }
        const expectedDate = parseDate(order.expectedDate);
        return (
          order.remainingQty > 0 &&
          (!expectedDate || expectedDate.getTime() <= material.deadlineDate.getTime())
        );
      });

      const visibleIncomingBeforeDeadline = roundQuantity(
        eligibleIncomingBeforeDeadline.reduce(
          (sum, order) => sum + toNumber(order.remainingQty),
          0
        )
      );

      const visibleIncomingAfterDeadline = roundQuantity(
        incomingOrders.reduce((sum, order) => {
          const expectedDate = parseDate(order.expectedDate);
          if (
            order.remainingQty <= 0 ||
            !material.deadlineDate ||
            !expectedDate ||
            expectedDate.getTime() <= material.deadlineDate.getTime()
          ) {
            return sum;
          }
          return sum + toNumber(order.remainingQty);
        }, 0)
      );

      let allocationFromStock = roundQuantity(
        Math.min(currentStockRemaining, material.required)
      );
      currentStockRemaining = roundQuantity(
        Math.max(currentStockRemaining - allocationFromStock, 0)
      );

      let remainingRequirement = roundQuantity(material.required - allocationFromStock);
      let allocationFromIncoming = 0;
      const coveredByOrders = [];

      eligibleIncomingBeforeDeadline.forEach((order) => {
        if (remainingRequirement <= 0 || order.remainingQty <= 0) {
          return;
        }

        const allocatedQty = roundQuantity(
          Math.min(order.remainingQty, remainingRequirement)
        );
        if (allocatedQty <= 0) {
          return;
        }

        order.remainingQty = roundQuantity(order.remainingQty - allocatedQty);
        allocationFromIncoming = roundQuantity(allocationFromIncoming + allocatedQty);
        remainingRequirement = roundQuantity(remainingRequirement - allocatedQty);
        coveredByOrders.push({
          purchaseOrderId: order.purchaseOrderId,
          poNumber: order.poNumber,
          vendorId: order.vendorId,
          quantity: allocatedQty,
          expectedDate: order.expectedDate,
          locationId: order.locationId,
        });
      });

      const available = roundQuantity(allocationFromStock + allocationFromIncoming);
      const shortage = roundQuantity(Math.max(material.required - available, 0));
      const recommendedOrder = shortage;
      const status =
        shortage > 0
          ? "shortage"
          : allocationFromIncoming > 0 || visibleCurrentStock < material.required
          ? "low"
          : "ok";

      const line = {
        ...material,
        available,
        availableNow: visibleCurrentStock,
        incomingBeforeDeadline: visibleIncomingBeforeDeadline,
        incomingAfterDeadline: visibleIncomingAfterDeadline,
        shortage,
        recommendedOrder,
        allocationFromStock,
        allocationFromIncoming,
        coveredByOrders,
        status,
      };

      shortageLines.push(line);

      const projectSummary = projectSummaries.get(String(material.projectId)) || {
        projectId: material.projectId,
        projectName: material.projectName,
        deadline: material.deadline,
        materials: [],
        totalRequired: 0,
        totalAvailable: 0,
        totalShortage: 0,
      };
      projectSummary.materials.push(line);
      projectSummary.totalRequired = roundQuantity(
        projectSummary.totalRequired + material.required
      );
      projectSummary.totalAvailable = roundQuantity(
        projectSummary.totalAvailable + available
      );
      projectSummary.totalShortage = roundQuantity(
        projectSummary.totalShortage + shortage
      );
      projectSummaries.set(String(material.projectId), projectSummary);

      const materialSummary = materialSummaries.get(material.materialKey) || {
        materialKey: material.materialKey,
        productId: material.productId,
        productName: material.productName,
        unit: material.unit,
        hsn: material.hsn,
        totalRequired: 0,
        totalAvailable: 0,
        totalShortage: 0,
        projects: [],
      };
      materialSummary.totalRequired = roundQuantity(
        materialSummary.totalRequired + material.required
      );
      materialSummary.totalAvailable = roundQuantity(
        materialSummary.totalAvailable + available
      );
      materialSummary.totalShortage = roundQuantity(
        materialSummary.totalShortage + shortage
      );
      materialSummary.projects.push({
        projectId: material.projectId,
        projectName: material.projectName,
        deadline: material.deadline,
        shortage,
        required: material.required,
      });
      materialSummaries.set(material.materialKey, materialSummary);
    });
  });

  const projects = Array.from(projectSummaries.values())
    .map((project) => ({
      ...project,
      status: project.totalShortage > 0 ? "shortage" : project.materials.some((item) => item.status === "low") ? "low" : "ok",
      materials: [...project.materials].sort((left, right) =>
        String(left.productName).localeCompare(String(right.productName))
      ),
    }))
    .sort((left, right) => compareDates(left.deadline, right.deadline));

  const materials = Array.from(materialSummaries.values()).sort((left, right) =>
    String(left.productName).localeCompare(String(right.productName))
  );

  return {
    projects,
    materials,
    shortages: shortageLines.filter((line) => line.shortage > 0),
    allLines: shortageLines,
  };
};

export const generatePurchaseRecommendations = ({
  shortages = [],
  purchaseOrders = [],
  vendors = [],
  items = [],
} = {}) => {
  const inventoryResolver = createInventoryResolver(items);
  const vendorMap = new Map(
    (Array.isArray(vendors) ? vendors : []).map((vendor) => [String(vendor.id), vendor])
  );
  const vendorHints = new Map();

  [...(Array.isArray(purchaseOrders) ? purchaseOrders : [])]
    .sort(compareByRecentDate)
    .forEach((order) => {
      (order.items || []).forEach((item) => {
        const resolvedItem = inventoryResolver.resolve(item);
        const materialKey = getMaterialKey(item, resolvedItem);
        if (vendorHints.has(materialKey)) {
          return;
        }

        const vendor = vendorMap.get(String(order.vendorId ?? "")) || null;
        vendorHints.set(materialKey, {
          vendorId: order.vendorId ?? null,
          vendorName: vendor ? getVendorLabel(vendor) : "",
          locationId: order.locationId ?? null,
          unitPrice: roundUnitPrice(item.unitPrice ?? item.rate ?? 0),
        });
      });
    });

  return (Array.isArray(shortages) ? shortages : [])
    .filter((shortage) => shortage.shortage > 0)
    .map((shortage) => {
      const hint = vendorHints.get(shortage.materialKey) || {};
      return {
        id: `mrp-rec-${createHash(`${shortage.projectId}-${shortage.materialKey}`)}`,
        projectId: shortage.projectId,
        projectName: shortage.projectName,
        deadline: shortage.deadline,
        productId: shortage.productId,
        productName: shortage.productName,
        materialKey: shortage.materialKey,
        unit: shortage.unit,
        hsn: shortage.hsn,
        gst: shortage.gst,
        required: shortage.required,
        available: shortage.available,
        shortage: shortage.shortage,
        recommendedOrder: shortage.recommendedOrder,
        vendorId: hint.vendorId ?? null,
        vendorName: hint.vendorName ?? "",
        locationId: hint.locationId ?? shortage.locationId ?? null,
        unitPrice: roundUnitPrice(hint.unitPrice ?? shortage.price ?? 0),
        notes: `MRP recommendation for ${shortage.projectName}.`,
        message: `${shortage.productName} is short by ${shortage.shortage} ${shortage.unit} for ${shortage.projectName}.`,
      };
    })
    .sort((left, right) => compareDates(left.deadline, right.deadline));
};

export const calculateDemandForecast = ({
  items = [],
  consumptions = [],
  inventoryAvailability = { materialMap: new Map() },
  lookbackDays = DEFAULT_FORECAST_LOOKBACK_DAYS,
  now = new Date(),
} = {}) => {
  const inventoryResolver = createInventoryResolver(items);
  const materialUsage = new Map();
  const currentTime = parseDate(now) ?? new Date();
  const lookbackStart = new Date(currentTime.getTime() - lookbackDays * DAY_IN_MS);

  (Array.isArray(consumptions) ? consumptions : []).forEach((record) => {
    const recordDate = parseDate(record.consumptionDate ?? record.createdAt);
    if (!recordDate || recordDate.getTime() < lookbackStart.getTime()) {
      return;
    }

    (record.items || []).forEach((item) => {
      const resolvedItem = inventoryResolver.resolve(item);
      const materialKey = getMaterialKey(item, resolvedItem);
      const current = materialUsage.get(materialKey) || {
        totalConsumed: 0,
        lastConsumedAt: "",
      };
      current.totalConsumed = roundQuantity(
        current.totalConsumed + toNumber(item.quantity)
      );
      current.lastConsumedAt =
        recordDate.toISOString() > String(current.lastConsumedAt || "")
          ? recordDate.toISOString()
          : current.lastConsumedAt;
      materialUsage.set(materialKey, current);
    });
  });

  const inventoryMap =
    inventoryAvailability.materialMap instanceof Map
      ? inventoryAvailability.materialMap
      : new Map();

  const forecastItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const resolvedItem = inventoryResolver.resolve(item) || item;
      const base = buildBaseMaterial(item, resolvedItem);
      const usage = materialUsage.get(base.materialKey) || {
        totalConsumed: 0,
        lastConsumedAt: "",
      };
      const inventoryEntry = inventoryMap.get(base.materialKey) || {
        currentStock: toNumber(item.stock),
        incomingPurchaseOrders: 0,
      };
      const currentStock = roundQuantity(toNumber(inventoryEntry.currentStock));
      const incomingPurchaseOrders = roundQuantity(
        toNumber(inventoryEntry.incomingPurchaseOrders)
      );
      const averageDailyUsage = roundQuantity(usage.totalConsumed / lookbackDays);
      const daysRemaining =
        averageDailyUsage > 0 ? roundQuantity(currentStock / averageDailyUsage) : null;
      const depletionDate =
        daysRemaining === null
          ? ""
          : toIsoDate(new Date(currentTime.getTime() + daysRemaining * DAY_IN_MS));
      const status =
        daysRemaining !== null && daysRemaining <= CRITICAL_FORECAST_WINDOW_DAYS
          ? "critical"
          : daysRemaining !== null && daysRemaining <= WARNING_FORECAST_WINDOW_DAYS
          ? "warning"
          : "ok";

      return {
        ...base,
        currentStock,
        incomingPurchaseOrders,
        totalConsumed: usage.totalConsumed,
        averageDailyUsage,
        daysRemaining,
        depletionDate,
        lastConsumedAt: usage.lastConsumedAt || "",
        status,
      };
    })
    .sort((left, right) => {
      if (left.daysRemaining === null && right.daysRemaining === null) {
        return String(left.productName).localeCompare(String(right.productName));
      }
      if (left.daysRemaining === null) {
        return 1;
      }
      if (right.daysRemaining === null) {
        return -1;
      }
      return left.daysRemaining - right.daysRemaining;
    });

  return {
    items: forecastItems,
    atRisk: forecastItems.filter(
      (item) =>
        item.daysRemaining !== null &&
        item.daysRemaining <= WARNING_FORECAST_WINDOW_DAYS &&
        item.averageDailyUsage > 0
    ),
  };
};

export const buildMrpSnapshot = ({
  projects = [],
  boqs = [],
  items = [],
  purchaseOrders = [],
  consumptions = [],
  vendors = [],
  settings = {},
  now = new Date(),
} = {}) => {
  const projectRequirements = calculateProjectRequirements({
    projects,
    boqs,
    consumptions,
    items,
  });

  const inventoryAvailability = calculateInventoryAvailability({
    items,
    purchaseOrders,
  });

  const shortageResults = detectMaterialShortages({
    projectRequirements,
    inventoryAvailability,
  });

  const recommendations = generatePurchaseRecommendations({
    shortages: shortageResults.shortages,
    purchaseOrders,
    vendors,
    items,
  });

  const forecast = calculateDemandForecast({
    items,
    consumptions,
    inventoryAvailability,
    lookbackDays:
      toNumber(
        settings?.inventory?.forecastLookbackDays ??
          settings?.inventory?.consumptionLookbackDays
      ) || DEFAULT_FORECAST_LOOKBACK_DAYS,
    now,
  });

  return {
    generatedAt: (parseDate(now) ?? new Date()).toISOString(),
    projectRequirements,
    inventoryAvailability,
    shortageResults,
    recommendations,
    forecast,
    summary: {
      projectCount: shortageResults.projects.length,
      trackedMaterials: inventoryAvailability.materials.length,
      shortageCount: shortageResults.shortages.length,
      recommendationCount: recommendations.length,
      totalRecommendedOrder: roundQuantity(
        recommendations.reduce(
          (sum, recommendation) => sum + recommendation.recommendedOrder,
          0
        )
      ),
      atRiskForecastCount: forecast.atRisk.length,
    },
  };
};
