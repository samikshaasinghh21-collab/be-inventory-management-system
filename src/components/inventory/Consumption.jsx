import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createConsumption,
  deleteConsumption,
  fetchConsumptions,
  updateConsumption,
} from "../../services/consumptionApi";
import { fetchAvailableInventory } from "../../services/availableInventoryApi";
import { fetchDeliveryChallans } from "../../services/deliveryChallanApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchProjects } from "../../services/projectsApi";
import { getProjects as getCachedProjects } from "../../services/projectsStore";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import DocumentViewPanel from "./DocumentViewPanel";
import { formatDate } from "../../utils/dateFormat";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";

const panel =
  "rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
const qtyInput =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

const issuedByOptions = [
  "Store Keeper",
  "Site Engineer",
  "Supervisor",
  "Project Manager",
];
const statusOptions = ["Logged", "Reviewed", "Approved"];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value = "") => String(value ?? "").trim().toLowerCase();

const formatQty = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const materialKey = (item = {}) => {
  const name = normalizeText(item.name ?? item.ItemName ?? item.Item ?? "");
  if (!name) {
    return "";
  }
  const unit =
    String(item.unit ?? item.Unit ?? "PCS")
      .trim()
      .toUpperCase() || "PCS";
  return `${name}::${unit}`;
};

const parseDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const source = String(value).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(source);
  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );
  }

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const isSameDay = (left, right) =>
  left &&
  right &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatQuantityInputText = (value) =>
  Math.max(toNumber(value), 0)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0$/, "$1");

const clampQuantityText = (rawValue) => {
  const next = String(rawValue ?? "").trim();
  if (!next) {
    return "";
  }
  if (!/^\d*(?:\.\d{0,2})?$/.test(next)) {
    return null;
  }

  const parsed = toNumber(next);
  if (parsed < 0) {
    return "0";
  }
  return next;
};

const buildConsumptionReference = (records = []) => {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^CON-${year}-(\\d+)$`, "i");
  const last = (Array.isArray(records) ? records : []).reduce((max, row) => {
    const match = pattern.exec(String(row?.consumptionNumber ?? "").trim());
    const sequence = match ? Number.parseInt(match[1], 10) : 0;
    return Math.max(max, Number.isFinite(sequence) ? sequence : 0);
  }, 0);
  return `CON-${year}-${String(last + 1).padStart(3, "0")}`;
};

const isConsumptionLinkedToChallan = (consumption = {}, challan = {}) => {
  const challanId = toNullableInt(challan.id);
  const consumptionChallanId = toNullableInt(
    consumption.deliveryChallanId ?? consumption.DeliveryChallanId
  );

  if (challanId !== null && consumptionChallanId === challanId) {
    return true;
  }

  const challanRef = normalizeText(challan.dcNumber ?? challan.DCNumber ?? "");
  const consumptionRef = normalizeText(
    consumption.deliveryChallanRef ?? consumption.DeliveryChallanRef ?? ""
  );

  return Boolean(challanRef && consumptionRef && challanRef === consumptionRef);
};

const buildExistingConsumptionLookup = (items = []) => {
  const bySourceKey = new Map();
  const bySourceId = new Map();
  const byMaterialKey = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const sourceKey = String(item.sourceKey ?? item.SourceKey ?? "").trim();
    if (sourceKey) {
      if (!bySourceKey.has(sourceKey)) {
        bySourceKey.set(sourceKey, []);
      }
      bySourceKey.get(sourceKey).push(item);
      return;
    }

    const sourceId = toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId);
    if (sourceId !== null) {
      if (!bySourceId.has(sourceId)) {
        bySourceId.set(sourceId, []);
      }
      bySourceId.get(sourceId).push(item);
      return;
    }

    const key = materialKey(item);
    if (!key) {
      return;
    }
    if (!byMaterialKey.has(key)) {
      byMaterialKey.set(key, []);
    }
    byMaterialKey.get(key).push(item);
  });

  return { bySourceKey, bySourceId, byMaterialKey };
};

const takeExistingItem = ({ sourceKey, sourceId, key, existingLookup }) => {
  if (!existingLookup) {
    return null;
  }

  if (sourceKey && existingLookup.bySourceKey.has(sourceKey)) {
    const queue = existingLookup.bySourceKey.get(sourceKey);
    const match = queue.shift() ?? null;
    if (!queue.length) {
      existingLookup.bySourceKey.delete(sourceKey);
    }
    return match;
  }

  if (sourceId !== null && existingLookup.bySourceId.has(sourceId)) {
    const queue = existingLookup.bySourceId.get(sourceId);
    const match = queue.shift() ?? null;
    if (!queue.length) {
      existingLookup.bySourceId.delete(sourceId);
    }
    return match;
  }

  if (key && existingLookup.byMaterialKey.has(key)) {
    const queue = existingLookup.byMaterialKey.get(key);
    const match = queue.shift() ?? null;
    if (!queue.length) {
      existingLookup.byMaterialKey.delete(key);
    }
    return match;
  }

  return null;
};

const buildRowsFromSelectedChallan = ({
  challan,
  consumptions,
  editingConsumption,
  autoSelectAvailable = false,
}) => {
  if (!challan || !Array.isArray(challan.items) || !challan.items.length) {
    return [];
  }

  const excludedConsumptionId = toNullableInt(editingConsumption?.id);

  const consumedBySourceId = new Map();
  const consumedByMaterialKey = new Map();

  (Array.isArray(consumptions) ? consumptions : []).forEach((consumption) => {
    const consumptionId = toNullableInt(consumption?.id);
    if (excludedConsumptionId !== null && consumptionId === excludedConsumptionId) {
      return;
    }
    if (!isConsumptionLinkedToChallan(consumption, challan)) {
      return;
    }

    (consumption.items || []).forEach((item) => {
      const quantity = Math.max(toNumber(item.quantity), 0);
      if (!quantity) {
        return;
      }

      const sourceId = toNullableInt(item.receiveGoodsItemId ?? item.ReceiveGoodsItemId);
      if (sourceId !== null) {
        consumedBySourceId.set(sourceId, (consumedBySourceId.get(sourceId) ?? 0) + quantity);
        return;
      }

      const key = materialKey(item);
      if (!key) {
        return;
      }
      consumedByMaterialKey.set(key, (consumedByMaterialKey.get(key) ?? 0) + quantity);
    });
  });

  const existingLookup = editingConsumption
    ? buildExistingConsumptionLookup(editingConsumption.items || [])
    : null;

  return challan.items.map((line, index) => {
    const sourceId = toNullableInt(line.receiveGoodsItemId ?? line.ReceiveGoodsItemId);
    const key = materialKey(line);
    const dcQuantity = Math.max(toNumber(line.quantity ?? line.Quantity), 0);

    const previouslyConsumed =
      sourceId !== null
        ? consumedBySourceId.get(sourceId) ?? 0
        : consumedByMaterialKey.get(key) ?? 0;

    const availableQuantity = Math.max(dcQuantity - previouslyConsumed, 0);
    const existingItem = takeExistingItem({ sourceId, key, existingLookup });
    const existingQuantity = Math.max(toNumber(existingItem?.quantity), 0);
    const shouldSelect = existingQuantity > 0 || (autoSelectAvailable && availableQuantity > 0);
    const selectedQuantity =
      existingQuantity > 0
        ? Math.min(existingQuantity, availableQuantity || existingQuantity)
        : autoSelectAvailable
        ? availableQuantity
        : 0;

    return {
      rowId: `${(sourceId ?? key) || "line"}-${index}`,
      index,
      boqItemId:
        toNullableInt(
          line.boqItemId ??
            line.itemId ??
            line.ItemId ??
            existingItem?.boqItemId ??
            existingItem?.itemId
        ) ?? null,
      itemId: toNullableInt(line.itemId ?? line.ItemId) ?? null,
      receiveGoodsItemId: sourceId,
      name: line.name ?? line.ItemName ?? "",
      description: line.description ?? line.Description ?? "",
      unit: line.unit ?? line.Unit ?? "PCS",
      hsn: line.hsn ?? line.HSN ?? "",
      gst: line.gst ?? line.GST ?? "",
      rate: toNumber(line.rate ?? line.Rate),
      notes: line.notes ?? line.Notes ?? "",
      dcQty: dcQuantity,
      previouslyConsumed,
      availableQty: availableQuantity,
      selected: shouldSelect,
      consumeQty: selectedQuantity > 0 ? formatQuantityInputText(selectedQuantity) : "",
    };
  });
};

const buildRowsFromAvailableInventory = ({
  rows,
  editingConsumption,
  autoSelectAvailable = false,
}) => {
  const existingLookup = editingConsumption
    ? buildExistingConsumptionLookup(editingConsumption.items || [])
    : null;

  return (Array.isArray(rows) ? rows : []).map((line, index) => {
    const sourceKey = String(line.sourceKey ?? "").trim();
    const sourceId = toNullableInt(line.receiveGoodsItemId);
    const key = materialKey(line);
    const availableQuantity = Math.max(toNumber(line.availableQty), 0);
    const existingItem = takeExistingItem({
      sourceKey,
      sourceId,
      key,
      existingLookup,
    });
    const existingQuantity = Math.max(toNumber(existingItem?.quantity), 0);
    const selectedQuantity =
      existingQuantity > 0
        ? Math.min(existingQuantity, availableQuantity || existingQuantity)
        : autoSelectAvailable
        ? availableQuantity
        : 0;

    return {
      rowId: `${sourceKey || sourceId || key || "available"}-${index}`,
      index,
      sourceType: line.sourceType || "receive",
      sourceKey,
      sourceRef: line.sourceRef || "",
      sourceQty: Math.max(toNumber(line.sourceQty), 0),
      boqItemId: toNullableInt(existingItem?.boqItemId ?? line.itemId) ?? null,
      itemId: toNullableInt(line.itemId ?? existingItem?.itemId) ?? null,
      receiveGoodsId: toNullableInt(line.receiveGoodsId),
      receiveGoodsItemId: sourceId,
      deliveryChallanId: toNullableInt(line.deliveryChallanId),
      deliveryChallanItemId: toNullableInt(line.deliveryChallanItemId),
      deliveryChallanRef: line.sourceType === "dc" ? line.sourceRef || "" : "",
      name: line.name || "",
      description: line.description || "",
      unit: line.unit || "PCS",
      hsn: line.hsn || "",
      gst: line.gst || "",
      rate: toNumber(line.rate),
      notes: line.notes || "",
      dcQty: Math.max(toNumber(line.sourceQty), 0),
      previouslyConsumed: Math.max(toNumber(line.consumedQty), 0),
      reallocatedQty: Math.max(toNumber(line.reallocatedQty), 0),
      availableQty: availableQuantity,
      selected: selectedQuantity > 0,
      consumeQty: selectedQuantity > 0 ? formatQuantityInputText(selectedQuantity) : "",
    };
  });
};

const createEmptyForm = ({ records = [], company = {} }) => ({
  consumptionNumber: buildConsumptionReference(records),
  projectId: "",
  locationId: "",
  deliveryChallanId: "",
  deliveryChallanRef: "",
  consumptionDate: new Date().toISOString().slice(0, 10),
  issuedBy: "Store Keeper",
  status: "Logged",
  notes: "",
  companyAddress: company.address ?? "",
  companyGstin: company.gstin ?? "",
  companyPhone: company.phone ?? "",
  companyEmail: company.email ?? "",
});

const statusPillClass = (status) => {
  const value = normalizeText(status);
  if (value === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value === "reviewed") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-violet-200 bg-violet-50 text-violet-700";
};

const Consumption = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const company = settings?.company ?? {};

  const [projects, setProjects] = useState(() => getCachedProjects());
  const [locations, setLocations] = useState([]);
  const [deliveryChallans, setDeliveryChallans] = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [availableInventory, setAvailableInventory] = useState([]);

  const [form, setForm] = useState(() => createEmptyForm({ company }));
  const [itemRows, setItemRows] = useState([]);
  const [selectedDeliveryChallanIds, setSelectedDeliveryChallanIds] = useState([]);
  const [, setLoadedDeliveryChallanIds] = useState([]);
  const [deliveryChallanFilter, setDeliveryChallanFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingConsumption, setEditingConsumption] = useState(null);

  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [inventoryError, setInventoryError] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewRecord, setViewRecord] = useState(null);

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

  const deliveryChallanMap = useMemo(
    () =>
      deliveryChallans.reduce((acc, challan) => {
        acc[String(challan.id)] = challan;
        return acc;
      }, {}),
    [deliveryChallans]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsList, locationsList, challansList, consumptionsList] = await Promise.all([
        fetchProjects().catch(() => getCachedProjects()),
        fetchLocations().catch(() => []),
        fetchDeliveryChallans().catch(() => []),
        fetchConsumptions().catch(() => []),
      ]);

      setProjects(Array.isArray(projectsList) ? projectsList : []);
      setLocations(Array.isArray(locationsList) ? locationsList : []);
      setDeliveryChallans(Array.isArray(challansList) ? challansList : []);
      setConsumptions(Array.isArray(consumptionsList) ? consumptionsList : []);

      return {
        projects: Array.isArray(projectsList) ? projectsList : [],
        locations: Array.isArray(locationsList) ? locationsList : [],
        deliveryChallans: Array.isArray(challansList) ? challansList : [],
        consumptions: Array.isArray(consumptionsList) ? consumptionsList : [],
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const resetForm = useCallback(
    ({ nextRecords = consumptions } = {}) => {
      setEditingId(null);
      setEditingConsumption(null);
      setErrors({});
      setFeedback({ type: "", message: "" });
      setItemRows([]);
      setAvailableInventory([]);
      setInventoryError("");
      setSelectedDeliveryChallanIds([]);
      setLoadedDeliveryChallanIds([]);
      setDeliveryChallanFilter("");
      setForm(() => createEmptyForm({ records: nextRecords, company }));
    },
    [company, consumptions]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const refresh = () => {
      void loadAll();
    };

    window.addEventListener("consumptions:changed", refresh);
    window.addEventListener("delivery-challans:changed", refresh);
    window.addEventListener("projects:changed", refresh);
    window.addEventListener("locations:changed", refresh);

    return () => {
      window.removeEventListener("consumptions:changed", refresh);
      window.removeEventListener("delivery-challans:changed", refresh);
      window.removeEventListener("projects:changed", refresh);
      window.removeEventListener("locations:changed", refresh);
    };
  }, [loadAll]);

  useEffect(() => {
    if (editingId || form.projectId || !projects.length) {
      return;
    }

    const activeProjectId = getActiveProjectId();
    if (!activeProjectId) {
      return;
    }

    const exists = projects.some(
      (project) => String(project.id) === String(activeProjectId)
    );
    if (!exists) {
      return;
    }

    setForm((prev) => ({ ...prev, projectId: String(activeProjectId) }));
  }, [editingId, form.projectId, projects]);

  useEffect(() => {
    if (!form.projectId) {
      return;
    }
    setActiveProjectId(form.projectId);
  }, [form.projectId]);

  const selectedProjectLocations = useMemo(() => {
    if (!form.projectId) {
      return locations;
    }
    const matchingLocations = locations.filter(
      (location) => String(location.projectId) === String(form.projectId)
    );
    if (matchingLocations.length) {
      return matchingLocations;
    }
    return locations;
  }, [form.projectId, locations]);

  useEffect(() => {
    let cancelled = false;
    const projectId = form.projectId;
    const locationId = form.locationId;

    if (!projectId || !locationId) {
      setAvailableInventory([]);
      setInventoryError("");
      if (!editingId) {
        setItemRows([]);
      }
      return () => {
        cancelled = true;
      };
    }

    setInventoryLoading(true);
    setInventoryError("");
    fetchAvailableInventory({
      projectId,
      locationId,
      excludeConsumptionId: editingId || undefined,
    })
      .then((list) => {
        if (cancelled) {
          return;
        }
        const safeList = Array.isArray(list) ? list : [];
        setAvailableInventory(safeList);
        setItemRows(
          buildRowsFromAvailableInventory({
            rows: safeList,
            editingConsumption,
          })
        );
        setLoadedDeliveryChallanIds([]);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setAvailableInventory([]);
        setItemRows([]);
        setInventoryError(
          error?.response?.data?.error ||
            error?.message ||
            "Could not load available inventory."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setInventoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editingConsumption, editingId, form.locationId, form.projectId]);

  const availableChallans = useMemo(() => {
    if (!form.projectId) {
      return deliveryChallans;
    }
    return deliveryChallans.filter(
      (challan) => String(challan.projectId) === String(form.projectId)
    );
  }, [deliveryChallans, form.projectId]);

  const filteredDeliveryChallansForSelection = useMemo(() => {
    const keyword = normalizeText(deliveryChallanFilter);
    const selectedLocationId = String(form.locationId || "");
    return availableChallans.filter((challan) => {
      if (
        selectedLocationId &&
        String(challan.toLocationId ?? challan.ToLocationId ?? "") !== selectedLocationId
      ) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const fromLocation =
        locationMap[String(challan.fromLocationId)]?.name ||
        challan.fromLocation ||
        "";
      const toLocation =
        locationMap[String(challan.toLocationId)]?.name ||
        challan.toLocation ||
        "";
      return [
        challan.dcNumber,
        fromLocation,
        toLocation,
        challan.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [availableChallans, deliveryChallanFilter, form.locationId, locationMap]);

  const selectedDeliveryChallans = useMemo(
    () =>
      selectedDeliveryChallanIds
        .map((challanId) => deliveryChallanMap[String(challanId)])
        .filter(Boolean),
    [deliveryChallanMap, selectedDeliveryChallanIds]
  );

  const selectableFilteredDeliveryChallanIds = useMemo(
    () => filteredDeliveryChallansForSelection.map((challan) => String(challan.id)),
    [filteredDeliveryChallansForSelection]
  );

  const allFilteredDeliveryChallansSelected = useMemo(() => {
    if (!selectableFilteredDeliveryChallanIds.length) {
      return false;
    }
    return selectableFilteredDeliveryChallanIds.every((challanId) =>
      selectedDeliveryChallanIds.includes(challanId)
    );
  }, [selectableFilteredDeliveryChallanIds, selectedDeliveryChallanIds]);

  const allSelectableRows = useMemo(
    () => itemRows.filter((row) => row.availableQty > 0),
    [itemRows]
  );

  const isAllChecked = useMemo(() => {
    if (!allSelectableRows.length) {
      return false;
    }
    return allSelectableRows.every((row) => row.selected);
  }, [allSelectableRows]);

  const selectedRows = useMemo(
    () =>
      itemRows.filter((row) => row.selected && Math.max(toNumber(row.consumeQty), 0) > 0),
    [itemRows]
  );

  const totalToConsume = useMemo(
    () => selectedRows.reduce((sum, row) => sum + Math.max(toNumber(row.consumeQty), 0), 0),
    [selectedRows]
  );

  const getChallanItemCount = (challan = {}) =>
    Array.isArray(challan.items) ? challan.items.length : 0;

  const getChallanTotalQuantity = (challan = {}) =>
    (Array.isArray(challan.items) ? challan.items : []).reduce(
      (sum, item) => sum + Math.max(toNumber(item.quantity ?? item.Quantity), 0),
      0
    );

  const getChallanAvailableQuantity = useCallback(
    (challan = {}) => {
      const challanId = String(challan.id ?? challan.deliveryChallanId ?? "");
      if (!challanId) {
        return 0;
      }
      return availableInventory.reduce((sum, row) => {
        const isDcRow = normalizeText(row.sourceType) === "dc";
        const rowChallanId = String(row.deliveryChallanId ?? "");
        return isDcRow && rowChallanId === challanId
          ? sum + Math.max(toNumber(row.availableQty), 0)
          : sum;
      }, 0);
    },
    [availableInventory]
  );

  const getChallanLocationLabel = (challan = {}, type = "to") => {
    const id =
      type === "from"
        ? challan.fromLocationId ?? challan.FromLocationId
        : challan.toLocationId ?? challan.ToLocationId;
    const fallback =
      type === "from"
        ? challan.fromLocation ?? challan.FromLocation
        : challan.toLocation ?? challan.ToLocation;
    return locationMap[String(id)]?.name || fallback || "-";
  };

  const selectedDeliveryChallansSummary = useMemo(
    () => ({
      challans: selectedDeliveryChallans.length,
      items: selectedDeliveryChallans.reduce(
        (sum, challan) => sum + getChallanItemCount(challan),
        0
      ),
      quantity: selectedDeliveryChallans.reduce(
        (sum, challan) => sum + getChallanTotalQuantity(challan),
        0
      ),
      availableQuantity: selectedDeliveryChallans.reduce(
        (sum, challan) => sum + getChallanAvailableQuantity(challan),
        0
      ),
    }),
    [getChallanAvailableQuantity, selectedDeliveryChallans]
  );

  const totalEntries = consumptions.length;

  const totalConsumedQuantity = useMemo(
    () =>
      consumptions.reduce(
        (sum, consumption) =>
          sum +
          (consumption.items || []).reduce(
            (itemSum, item) => itemSum + Math.max(toNumber(item.quantity), 0),
            0
          ),
        0
      ),
    [consumptions]
  );

  const todayConsumedQuantity = useMemo(() => {
    const today = new Date();
    return consumptions.reduce((sum, consumption) => {
      const consumptionDate = parseDateOnly(consumption.consumptionDate ?? consumption.createdAt);
      if (!isSameDay(today, consumptionDate)) {
        return sum;
      }
      return (
        sum +
        (consumption.items || []).reduce(
          (itemSum, item) => itemSum + Math.max(toNumber(item.quantity), 0),
          0
        )
      );
    }, 0);
  }, [consumptions]);

  const monthConsumedQuantity = useMemo(() => {
    const now = new Date();
    return consumptions.reduce((sum, consumption) => {
      const date = parseDateOnly(consumption.consumptionDate ?? consumption.createdAt);
      if (!date) {
        return sum;
      }
      if (
        date.getMonth() !== now.getMonth() ||
        date.getFullYear() !== now.getFullYear()
      ) {
        return sum;
      }
      return (
        sum +
        (consumption.items || []).reduce(
          (itemSum, item) => itemSum + Math.max(toNumber(item.quantity), 0),
          0
        )
      );
    }, 0);
  }, [consumptions]);

  const sortedRecords = useMemo(() => {
    return [...consumptions].sort((left, right) => {
      const leftDate =
        parseDateOnly(left.updatedAt ?? left.consumptionDate ?? left.createdAt)?.getTime() ??
        0;
      const rightDate =
        parseDateOnly(right.updatedAt ?? right.consumptionDate ?? right.createdAt)?.getTime() ??
        0;
      return rightDate - leftDate;
    });
  }, [consumptions]);

  const visibleRecords = useMemo(() => {
    const keyword = normalizeText(query);
    return sortedRecords.filter((record) => {
      const rowStatus = normalizeText(record.status || "Logged");
      if (statusFilter !== "all" && rowStatus !== normalizeText(statusFilter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const projectName = projectMap[String(record.projectId)]?.name || "";
      const locationName = locationMap[String(record.locationId)]?.name || "";
      const challanRef =
        deliveryChallanMap[String(record.deliveryChallanId)]?.dcNumber ||
        record.deliveryChallanRef ||
        "";

      const haystack = [
        record.consumptionNumber,
        projectName,
        locationName,
        challanRef,
        record.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [
    deliveryChallanMap,
    locationMap,
    projectMap,
    query,
    sortedRecords,
    statusFilter,
  ]);

  const clearError = (name) => {
    setErrors((prev) => {
      if (!prev[name]) {
        return prev;
      }
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const onProjectChange = (projectId) => {
    setForm((prev) => ({
      ...prev,
      projectId,
      locationId: "",
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    setItemRows([]);
    setSelectedDeliveryChallanIds([]);
    setLoadedDeliveryChallanIds([]);
    setDeliveryChallanFilter("");
    setAvailableInventory([]);
    setInventoryError("");
    clearError("projectId");
    clearError("locationId");
    clearError("deliveryChallanId");
  };

  const onLocationChange = (locationId) => {
    setForm((prev) => ({
      ...prev,
      locationId,
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    setItemRows([]);
    setSelectedDeliveryChallanIds([]);
    setLoadedDeliveryChallanIds([]);
    clearError("locationId");
    clearError("items");
  };

  const toggleDeliveryChallanSelection = (deliveryChallanId) => {
    const id = String(deliveryChallanId);
    if (!deliveryChallanMap[id]) {
      return;
    }
    setSelectedDeliveryChallanIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
    clearError("deliveryChallanId");
  };

  const toggleAllFilteredDeliveryChallans = () => {
    if (!selectableFilteredDeliveryChallanIds.length) {
      return;
    }
    setSelectedDeliveryChallanIds((prev) => {
      const allSelected = selectableFilteredDeliveryChallanIds.every((id) =>
        prev.includes(id)
      );
      if (allSelected) {
        return prev.filter((id) => !selectableFilteredDeliveryChallanIds.includes(id));
      }
      return Array.from(new Set([...prev, ...selectableFilteredDeliveryChallanIds]));
    });
    clearError("deliveryChallanId");
  };

  const clearDeliveryChallanSelection = () => {
    setSelectedDeliveryChallanIds([]);
    setLoadedDeliveryChallanIds([]);
    setItemRows(
      buildRowsFromAvailableInventory({
        rows: availableInventory,
        editingConsumption,
      })
    );
    setForm((prev) => ({
      ...prev,
      deliveryChallanId: "",
      deliveryChallanRef: "",
    }));
    clearError("deliveryChallanId");
    clearError("items");
  };

  const handleLoadSelectedDeliveryChallans = () => {
    if (!selectedDeliveryChallans.length) {
      clearDeliveryChallanSelection();
      return;
    }

    const loadedIds = selectedDeliveryChallans.map((challan) => String(challan.id));
    const loadedIdSet = new Set(loadedIds);
    const filteredInventoryRows = availableInventory.filter((row) => {
      const isDcRow = normalizeText(row.sourceType) === "dc";
      return isDcRow && loadedIdSet.has(String(row.deliveryChallanId ?? ""));
    });
    const nextRows = buildRowsFromAvailableInventory({
      rows: filteredInventoryRows,
      editingConsumption,
      autoSelectAvailable: true,
    });

    if (!nextRows.length || !nextRows.some((row) => row.availableQty > 0)) {
      setErrors((prev) => ({
        ...prev,
        items:
          "Selected delivery challans do not have remaining inventory for this location.",
      }));
      return;
    }

    const primaryChallan = selectedDeliveryChallans[0];
    setLoadedDeliveryChallanIds(loadedIds);
    setItemRows(nextRows);
    setForm((prev) => ({
      ...prev,
      projectId: primaryChallan.projectId ? String(primaryChallan.projectId) : prev.projectId,
      deliveryChallanId: primaryChallan.id ? String(primaryChallan.id) : "",
      deliveryChallanRef: selectedDeliveryChallans
        .map((challan) => challan.dcNumber)
        .filter(Boolean)
        .join(", "),
    }));
    clearError("locationId");
    clearError("deliveryChallanId");
    clearError("items");
  };

  const onToggleAllRows = (checked) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.availableQty <= 0) {
          return { ...row, selected: false, consumeQty: "" };
        }
        if (!checked) {
          return { ...row, selected: false, consumeQty: "" };
        }
        const nextQty =
          row.consumeQty && toNumber(row.consumeQty) > 0
            ? clampQuantityText(row.consumeQty)
            : formatQuantityInputText(row.availableQty);
        return {
          ...row,
          selected: true,
          consumeQty: nextQty ?? row.consumeQty,
        };
      })
    );
    clearError("items");
  };

  const onToggleRow = (rowId, checked) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        if (!checked) {
          return {
            ...row,
            selected: false,
            consumeQty: "",
          };
        }

        const fallbackQty = clampQuantityText(String(row.availableQty));
        return {
          ...row,
          selected: true,
          consumeQty:
            row.consumeQty && toNumber(row.consumeQty) > 0
              ? row.consumeQty
              : fallbackQty ?? row.consumeQty,
        };
      })
    );
    clearError("items");
  };

  const onConsumeQtyChange = (rowId, rawValue) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        const nextValue = clampQuantityText(rawValue);
        if (nextValue === null) {
          return row;
        }

        const numeric = Math.max(toNumber(nextValue), 0);
        const clamped = Math.min(numeric, Math.max(toNumber(row.availableQty), 0));
        return {
          ...row,
          consumeQty: clamped > 0 ? formatQuantityInputText(clamped) : "",
          selected: clamped > 0,
        };
      })
    );
    clearError("items");
  };

  const onConsumeQtyStep = (rowId, direction) => {
    setItemRows((prevRows) =>
      prevRows.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }

        const step = 1;
        const current = Math.max(toNumber(row.consumeQty), 0);
        const next = Math.min(
          Math.max(current + direction * step, 0),
          Math.max(toNumber(row.availableQty), 0)
        );
        return {
          ...row,
          consumeQty: next > 0 ? formatQuantityInputText(next) : "",
          selected: next > 0,
        };
      })
    );
    clearError("items");
  };

  const getRowConsumeQtyError = (row) => {
    if (!row.selected) {
      return "";
    }
    const requested = Math.max(toNumber(row.consumeQty), 0);
    if (!requested) {
      return "Enter consume quantity.";
    }
    if (requested > row.availableQty) {
      return `Cannot exceed available qty (${formatQty(row.availableQty)}).`;
    }
    return "";
  };

  const validate = () => {
    const nextErrors = {};

    if (!String(form.consumptionNumber || "").trim()) {
      nextErrors.consumptionNumber = "Consumption reference is required.";
    }
    if (!String(form.projectId || "").trim()) {
      nextErrors.projectId = "Project is required.";
    }
    if (!String(form.locationId || "").trim()) {
      nextErrors.locationId = "Location is required.";
    }
    if (!String(form.consumptionDate || "").trim()) {
      nextErrors.consumptionDate = "Consumption date is required.";
    }
    if (!String(form.issuedBy || "").trim()) {
      nextErrors.issuedBy = "Issued by is required.";
    }

    const chosen = itemRows.filter((row) => row.selected);
    if (!chosen.length) {
      nextErrors.items = "Select at least one available inventory item.";
    } else {
      const invalidRow = chosen.find((row) => {
        const requested = Math.max(toNumber(row.consumeQty), 0);
        return requested <= 0 || requested > row.availableQty;
      });

      if (invalidRow) {
        nextErrors.items = `Enter a valid consume quantity for ${invalidRow.name || "the selected item"}.`;
      }
    }

    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const buildPayload = () => {
    const selectedItems = itemRows
      .filter((row) => row.selected)
      .map((row) => ({
        boqItemId:
          toNullableInt(row.boqItemId) ??
          toNullableInt(row.itemId) ??
          null,
        itemId:
          toNullableInt(row.itemId) ??
          toNullableInt(row.boqItemId) ??
          toNullableInt(row.receiveGoodsItemId) ??
          null,
        receiveGoodsId: toNullableInt(row.receiveGoodsId),
        deliveryChallanId: toNullableInt(row.deliveryChallanId),
        deliveryChallanItemId: toNullableInt(row.deliveryChallanItemId),
        deliveryChallanRef: row.deliveryChallanRef || "",
        receiveGoodsItemId: toNullableInt(row.receiveGoodsItemId),
        sourceType: row.sourceType || "",
        sourceKey: row.sourceKey || "",
        name: row.name,
        description: row.description || "",
        unit: row.unit || "PCS",
        hsn: row.hsn || "",
        gst: row.gst || "",
        quantity: Math.max(toNumber(row.consumeQty), 0),
        consumeQty: Math.max(toNumber(row.consumeQty), 0),
        rate: Math.max(toNumber(row.rate), 0),
        notes: row.notes || "",
      }))
      .filter((item) => item.name && item.quantity > 0);
    const selectedDeliveryChallanIdsForPayload = Array.from(
      new Set(
        selectedItems
          .map((item) => toNullableInt(item.deliveryChallanId))
          .filter((id) => id !== null)
      )
    );
    const selectedDeliveryChallanRefsForPayload = Array.from(
      new Set(
        itemRows
          .filter((row) => row.selected && row.sourceType === "dc")
          .map((row) => row.sourceRef || row.deliveryChallanRef)
          .filter(Boolean)
      )
    );

    return {
      consumptionNumber: String(form.consumptionNumber || "").trim(),
      projectId: toNullableInt(form.projectId),
      locationId: toNullableInt(form.locationId),
      deliveryChallanId:
        selectedDeliveryChallanIdsForPayload[0] ?? toNullableInt(form.deliveryChallanId),
      deliveryChallanIds: selectedDeliveryChallanIdsForPayload,
      deliveryChallanRef:
        selectedDeliveryChallanRefsForPayload.join(", ") ||
        String(form.deliveryChallanRef || "").trim(),
      consumptionDate: form.consumptionDate || null,
      issuedBy: String(form.issuedBy || "").trim(),
      status: String(form.status || "Logged").trim() || "Logged",
      notes: String(form.notes || "").trim(),
      companyAddress: String(form.companyAddress || "").trim(),
      companyGstin: String(form.companyGstin || "").trim(),
      companyPhone: String(form.companyPhone || "").trim(),
      companyEmail: String(form.companyEmail || "").trim(),
      items: selectedItems,
    };
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFeedback({ type: "", message: "" });

    if (!validate()) {
      return;
    }

    const payload = buildPayload();

    setSaving(true);
    try {
      if (editingId) {
        await updateConsumption(editingId, payload);
      } else {
        await createConsumption(payload);
      }

      const latest = await loadAll();
      const wasEditing = Boolean(editingId);
      resetForm({ nextRecords: latest?.consumptions ?? [] });
      setFeedback({
        type: "success",
        message: wasEditing
          ? "Consumption entry updated successfully."
          : "Consumption entry saved successfully.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error?.response?.data?.error ||
          error?.message ||
          "Failed to save consumption entry.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (record) => {
    const recordChallanIds = Array.isArray(record.deliveryChallanIds)
      ? record.deliveryChallanIds.map((id) => String(id))
      : record.deliveryChallanId
      ? [String(record.deliveryChallanId)]
      : [];
    const recordChallanRefs = String(record.deliveryChallanRef || "")
      .split(",")
      .map((value) => normalizeText(value))
      .filter(Boolean);
    const linkedChallans = deliveryChallans.filter((challan) => {
      const id = String(challan.id);
      const ref = normalizeText(challan.dcNumber);
      return recordChallanIds.includes(id) || recordChallanRefs.includes(ref);
    });
    const linkedChallan = linkedChallans[0] ?? null;

    setEditingId(record.id);
    setEditingConsumption(record);
    setErrors({});
    setFeedback({ type: "", message: "" });

    const nextProjectId =
      linkedChallan?.projectId ?? record.projectId ?? form.projectId ?? "";
    const nextLocationId =
      record.locationId ??
      linkedChallan?.toLocationId ??
      linkedChallan?.locationId ??
      "";

    setForm((prev) => ({
      ...prev,
      consumptionNumber: record.consumptionNumber || prev.consumptionNumber,
      projectId: nextProjectId ? String(nextProjectId) : "",
      locationId: nextLocationId ? String(nextLocationId) : "",
      deliveryChallanId: linkedChallan ? String(linkedChallan.id) : "",
      deliveryChallanRef:
        linkedChallans.length
          ? linkedChallans.map((challan) => challan.dcNumber).filter(Boolean).join(", ")
          : record.deliveryChallanRef || prev.deliveryChallanRef,
      consumptionDate:
        String(record.consumptionDate || "").slice(0, 10) || prev.consumptionDate,
      issuedBy: record.issuedBy || prev.issuedBy,
      status: record.status || prev.status,
      notes: record.notes || "",
      companyAddress:
        record.companyAddress || prev.companyAddress || company.address || "",
      companyGstin:
        record.companyGstin || prev.companyGstin || company.gstin || "",
      companyPhone: record.companyPhone || prev.companyPhone || company.phone || "",
      companyEmail: record.companyEmail || prev.companyEmail || company.email || "",
    }));

    if (linkedChallans.length) {
      const ids = linkedChallans.map((challan) => String(challan.id));
      setSelectedDeliveryChallanIds(ids);
      setLoadedDeliveryChallanIds(ids);
      const rows = linkedChallans.flatMap((challan, challanIndex) =>
        buildRowsFromSelectedChallan({
          challan,
          consumptions,
          editingConsumption: record,
        }).map((row) => ({
          ...row,
          rowId: `${challan.id}-${row.rowId}`,
          sourceType: "dc",
          sourceKey:
            row.sourceKey ||
            `dc:${challan.id}:${row.receiveGoodsItemId ?? row.itemId ?? materialKey(row)}`,
          sourceRef: challan.dcNumber || "",
          deliveryChallanId: toNullableInt(challan.id),
          deliveryChallanRef: challan.dcNumber || "",
          sourceDcNumber: challan.dcNumber || `DC ${challanIndex + 1}`,
        }))
      );
      setItemRows(rows);
      return;
    }

    setSelectedDeliveryChallanIds([]);
    setLoadedDeliveryChallanIds([]);

    const fallbackRows = (record.items || []).map((item, index) => {
      const consumed = Math.max(toNumber(item.quantity), 0);
      return {
        rowId: `edit-${index}-${item.id ?? item.name ?? "row"}`,
        index,
        boqItemId: toNullableInt(item.boqItemId),
        itemId: null,
        receiveGoodsItemId: toNullableInt(item.receiveGoodsItemId),
        name: item.name || "",
        description: item.description || "",
        unit: item.unit || "PCS",
        hsn: item.hsn || "",
        gst: item.gst || "",
        rate: Math.max(toNumber(item.rate), 0),
        notes: item.notes || "",
        dcQty: consumed,
        previouslyConsumed: 0,
        availableQty: consumed,
        selected: consumed > 0,
        consumeQty: consumed > 0 ? String(consumed) : "",
      };
    });
    setItemRows(fallbackRows);
  };

  const onView = (record) => {
    setViewRecord(record || null);
  };

  const onDelete = async (record) => {
    const ok = window.confirm(
      `Delete consumption ${record.consumptionNumber || "entry"}?`
    );
    if (!ok) {
      return;
    }

    try {
      await deleteConsumption(record.id);
      const latest = await loadAll();

      if (editingId && String(editingId) === String(record.id)) {
        resetForm({ nextRecords: latest?.consumptions ?? [] });
      }

      setFeedback({ type: "success", message: "Consumption deleted successfully." });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error?.response?.data?.error ||
          error?.message ||
          "Failed to delete consumption entry.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate("/inventory/delivery-challan")}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
        >
          DC Option
        </button>
        <button
          type="button"
          onClick={() => navigate("/inventory/reallocate-return")}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
        >
          Reallocation
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">Total Entries</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">{totalEntries}</p>
        </article>

        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">Total Consumed Qty</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {formatQty(totalConsumedQuantity)}
          </p>
        </article>

        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">This Month</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {formatQty(monthConsumedQuantity)}
          </p>
        </article>

        <article className={`${panel} p-5`}>
          <p className="text-sm font-medium text-slate-500">Today</p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {formatQty(todayConsumedQuantity)}
          </p>
        </article>
      </section>

      <form onSubmit={onSubmit} className="space-y-5">
        <section className={panel}>
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-2xl font-semibold text-violet-800">Consumption Details</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-3">
            <label>
              <span className="text-sm font-semibold text-slate-700">
                Consumption Ref <span className="text-red-600">*</span>
              </span>
              <input
                className={field}
                value={form.consumptionNumber}
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    consumptionNumber: event.target.value,
                  }));
                  clearError("consumptionNumber");
                }}
                placeholder="CON-2026-001"
              />
              {errors.consumptionNumber && (
                <p className="mt-1 text-xs text-red-600">{errors.consumptionNumber}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Project <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.projectId}
                onChange={(event) => onProjectChange(event.target.value)}
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="mt-1 text-xs text-red-600">{errors.projectId}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Consumption Date <span className="text-red-600">*</span>
              </span>
              <DateInput
                className={field}
                value={form.consumptionDate}
                onChange={(nextValue) => {
                  setForm((prev) => ({ ...prev, consumptionDate: nextValue }));
                  clearError("consumptionDate");
                }}
              />
              {errors.consumptionDate && (
                <p className="mt-1 text-xs text-red-600">{errors.consumptionDate}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Issued By <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.issuedBy}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, issuedBy: event.target.value }));
                  clearError("issuedBy");
                }}
              >
                {issuedByOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.issuedBy && (
                <p className="mt-1 text-xs text-red-600">{errors.issuedBy}</p>
              )}
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                className={field}
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Location <span className="text-red-600">*</span>
              </span>
              <select
                className={field}
                value={form.locationId}
                onChange={(event) => onLocationChange(event.target.value)}
                disabled={!form.projectId}
              >
                <option value="">
                  {form.projectId ? "Select location" : "Select project first"}
                </option>
                {selectedProjectLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              {errors.locationId && (
                <p className="mt-1 text-xs text-red-600">{errors.locationId}</p>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-200 px-6 py-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Notes</span>
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Usage notes or approvals"
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">Company Address</span>
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={form.companyAddress}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, companyAddress: event.target.value }))
                }
                placeholder="Address"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-semibold text-slate-700">Phone</span>
                <input
                  className={field}
                  value={form.companyPhone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, companyPhone: event.target.value }))
                  }
                  placeholder="Phone"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">GSTIN</span>
                <input
                  className={field}
                  value={form.companyGstin}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, companyGstin: event.target.value }))
                  }
                  placeholder="GSTIN"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Email</span>
                <input
                  className={field}
                  value={form.companyEmail}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, companyEmail: event.target.value }))
                  }
                  placeholder="Email"
                />
              </label>
            </div>
          </div>
        </section>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-violet-800">
                Optional Delivery Challan Lookup
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Available inventory loads automatically from the selected project and location. Use this lookup only when you want to narrow the list to specific DCs.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="search"
                value={deliveryChallanFilter}
                onChange={(event) => setDeliveryChallanFilter(event.target.value)}
                placeholder="Search DC number or location..."
                className="w-full min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={() => void loadAll()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 px-4 py-4 xl:grid-cols-[1fr_260px]">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="max-h-[330px] overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="w-12 px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={allFilteredDeliveryChallansSelected}
                          onChange={toggleAllFilteredDeliveryChallans}
                          disabled={!filteredDeliveryChallansForSelection.length}
                        />
                      </th>
                      <th className="px-3 py-3 text-left">DC Number</th>
                      <th className="px-3 py-3 text-left">DC Date</th>
                      <th className="px-3 py-3 text-left">From</th>
                      <th className="px-3 py-3 text-left">To</th>
                      <th className="px-3 py-3 text-right">Item Count</th>
                      <th className="px-3 py-3 text-right">Total Quantity</th>
                      <th className="px-3 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!form.projectId ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          Select a project to review delivery challans.
                        </td>
                      </tr>
                    ) : filteredDeliveryChallansForSelection.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          No delivery challans found for this project.
                        </td>
                      </tr>
                    ) : (
                      filteredDeliveryChallansForSelection.map((challan) => {
                        const id = String(challan.id);
                        const isSelected = selectedDeliveryChallanIds.includes(id);
                        return (
                          <tr
                            key={id}
                            className="border-t border-slate-200 bg-white hover:bg-violet-50/40"
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDeliveryChallanSelection(id)}
                              />
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-800">
                              {challan.dcNumber || "-"}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {formatDate(challan.issueDate)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {getChallanLocationLabel(challan, "from")}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {getChallanLocationLabel(challan, "to")}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700">
                              {getChallanItemCount(challan)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-800">
                              {formatQty(getChallanTotalQuantity(challan))}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(
                                  challan.status
                                )}`}
                              >
                                {challan.status || "Draft"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-slate-500">
                  Showing {filteredDeliveryChallansForSelection.length} of {availableChallans.length} DCs
                </p>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-violet-800">
                    {selectedDeliveryChallanIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={clearDeliveryChallanSelection}
                    disabled={!selectedDeliveryChallanIds.length}
                    className="text-sm font-semibold text-violet-700 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>

            <aside className="rounded-lg border border-violet-100 bg-violet-50 p-4">
              <p className="text-sm font-semibold text-violet-900">Selection Summary</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total DCs Selected</span>
                  <span className="font-semibold text-slate-900">
                    {selectedDeliveryChallansSummary.challans}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total Items</span>
                  <span className="font-semibold text-slate-900">
                    {selectedDeliveryChallansSummary.items}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total Quantity</span>
                  <span className="font-semibold text-slate-900">
                    {formatQty(selectedDeliveryChallansSummary.quantity)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Total Available Qty</span>
                  <span className="font-semibold text-slate-900">
                    {formatQty(selectedDeliveryChallansSummary.availableQuantity)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadSelectedDeliveryChallans}
                disabled={!selectedDeliveryChallanIds.length}
                className="mt-5 w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Load Selected DCs
              </button>
              <p className="mt-3 text-xs text-slate-500">
                Loading DCs is optional; location inventory is already loaded below.
              </p>
            </aside>
          </div>
          {errors.deliveryChallanId && (
            <p className="px-6 pb-4 text-xs text-red-600">{errors.deliveryChallanId}</p>
          )}
          {errors.locationId && (
            <p className="px-6 pb-4 text-xs text-red-600">{errors.locationId}</p>
          )}
        </section>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-violet-800">
                Available Inventory
                {itemRows.length ? (
                  <span className="ml-3 rounded-full bg-violet-100 px-2.5 py-1 align-middle text-xs font-semibold text-violet-700">
                    {itemRows.length} Items
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Select items and provide consumption quantity. Available quantity includes Receive and DC stock minus prior consumption and reallocation.
              </p>
              {inventoryLoading && (
                <p className="mt-2 text-xs font-semibold text-violet-700">
                  Loading available inventory...
                </p>
              )}
              {!inventoryLoading && form.projectId && form.locationId && (
                <p className="mt-2 text-xs text-slate-500">
                  Showing {availableInventory.length} available balance rows for this location.
                </p>
              )}
              {inventoryError && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {inventoryError}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onToggleAllRows(true)}
                disabled={!allSelectableRows.length}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Add All Available Items
              </button>
              <button
                type="button"
                onClick={() => onToggleAllRows(false)}
                disabled={!selectedRows.length}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Clear Selection
              </button>
            </div>
          </div>

          <div className="overflow-x-auto px-2 pb-2 pt-3">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold w-12">
                    <input
                      type="checkbox"
                      checked={isAllChecked}
                      onChange={(event) => onToggleAllRows(event.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-semibold w-16">#</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[180px]">Source</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[220px]">Material</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[110px]">HSN / SAC</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[90px]">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[120px]">Source Qty</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[150px]">
                    Previously Consumed
                  </th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[150px]">
                    Reallocated
                  </th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[120px]">
                    Available Qty
                  </th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[140px]">
                    Consume Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {!itemRows.length && (
                  <tr>
                    <td colSpan="11" className="px-4 py-10 text-center text-slate-500">
                      {form.projectId && form.locationId
                        ? "No available inventory found for this project and location."
                        : "Select a project and location to load available inventory."}
                    </td>
                  </tr>
                )}

                {itemRows.map((row, index) => {
                  const rowQtyError = getRowConsumeQtyError(row);

                  return (
                    <tr key={row.rowId} className="border-b border-slate-200 bg-white">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={row.availableQty <= 0}
                        onChange={(event) => onToggleRow(row.rowId, event.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{index + 1}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <span className="font-semibold uppercase text-slate-600">
                        {row.sourceType === "dc" ? "DC" : row.sourceType || "Receive"}
                      </span>
                      {row.sourceRef ? (
                        <span className="block text-xs text-slate-500">
                          {row.sourceRef}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{row.name || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.hsn || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.unit || "PCS"}</td>
                    <td className="px-3 py-2 text-right text-slate-800">
                      {formatQty(row.dcQty)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatQty(row.previouslyConsumed)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatQty(row.reallocatedQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                      {formatQty(row.availableQty)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-8 w-8 rounded-md border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:border-slate-400"
                            onClick={() => onConsumeQtyStep(row.rowId, -1)}
                            disabled={row.availableQty <= 0}
                            aria-label={`Decrease consume quantity for ${row.name || "item"}`}
                          >
                            -
                          </button>
                          <input
                            className={qtyInput}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={row.consumeQty}
                            placeholder="0"
                            onChange={(event) =>
                              onConsumeQtyChange(row.rowId, event.target.value)
                            }
                            aria-invalid={Boolean(rowQtyError)}
                          />
                          <button
                            type="button"
                            className="h-8 w-8 rounded-md border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:border-slate-400"
                            onClick={() => onConsumeQtyStep(row.rowId, 1)}
                            disabled={row.availableQty <= 0}
                            aria-label={`Increase consume quantity for ${row.name || "item"}`}
                          >
                            +
                          </button>
                        </div>
                        <p className="text-xs font-semibold text-emerald-700">
                          Available: {formatQty(row.availableQty)}
                        </p>
                        {rowQtyError && (
                          <p className="text-xs text-red-600">{rowQtyError}</p>
                        )}
                      </div>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
              {!!itemRows.length && (
                <tfoot>
                  <tr className="bg-violet-50">
                    <td colSpan="9" className="px-3 py-3 text-right font-semibold text-violet-800">
                      Total Quantity to Consume:
                    </td>
                    <td colSpan="2" className="px-3 py-3 text-right text-lg font-bold text-violet-900">
                      {formatQty(totalToConsume)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {errors.items && <p className="px-6 pb-3 text-xs text-red-600">{errors.items}</p>}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => resetForm()}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => resetForm()}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-lg bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? editingId
                  ? "Updating..."
                  : "Saving..."
                : editingId
                ? "Update Consumption"
                : "Save Consumption"}
            </button>
          </div>
        </section>
      </form>

      {feedback.message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-semibold text-slate-800">Consumption Register</h2>
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reference, project, location"
              className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            >
              <option value="all">All Status</option>
              {statusOptions.map((option) => (
                <option key={option} value={option.toLowerCase()}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Project</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[170px]">Location</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">DC Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Date</th>
                <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Qty</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Status</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!visibleRecords.length && (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-slate-500">
                    {loading ? "Loading consumption records..." : "No consumption records found."}
                  </td>
                </tr>
              )}

              {visibleRecords.map((record) => {
                const totalQty = (record.items || []).reduce(
                  (sum, item) => sum + Math.max(toNumber(item.quantity), 0),
                  0
                );

                return (
                  <tr key={record.id} className="border-b border-slate-200 bg-white">
                    <td className="px-4 py-3 text-slate-800">
                      {record.consumptionNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {projectMap[String(record.projectId)]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {locationMap[String(record.locationId)]?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {deliveryChallanMap[String(record.deliveryChallanId)]?.dcNumber ||
                        record.deliveryChallanRef ||
                        "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(record.consumptionDate || record.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {formatQty(totalQty)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(
                          record.status || "Logged"
                        )}`}
                      >
                        {record.status || "Logged"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => onView(record)}
                          className="font-semibold text-slate-800 hover:underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(record)}
                          className="font-semibold text-violet-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate("/inventory/reallocate-return", {
                              state: { consumptionId: record.id },
                            })
                          }
                          className="font-semibold text-indigo-700 hover:underline"
                        >
                          Reallocation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onDelete(record);
                          }}
                          className="font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {viewRecord && (
          <DocumentViewPanel
            id="consumption-view-panel"
            title="CONSUMPTION"
            onClose={() => setViewRecord(null)}
            companyName={company.name || "Bangalore Electronics"}
            companyAddress={company.address || "Company address"}
            companyGstin={company.gstin || ""}
            companyPhone={company.phone || ""}
            companyEmail={company.email || ""}
            primaryPairs={[
              { label: "Consumption No", value: viewRecord.consumptionNumber || viewRecord.id },
              { label: "Date", value: formatDate(viewRecord.consumptionDate || viewRecord.createdAt) },
              { label: "Status", value: viewRecord.status || "Logged" },
              { label: "Issued By", value: viewRecord.issuedBy || "-" },
            ]}
            leftBlockTitle="Project"
            leftBlockLines={[
              projectMap[String(viewRecord.projectId)]?.name || "-",
              locationMap[String(viewRecord.locationId)]?.name || "-",
            ]}
            rightBlockTitle="Delivery Challan"
            rightBlockLines={[
              deliveryChallanMap[String(viewRecord.deliveryChallanId)]?.dcNumber ||
                viewRecord.deliveryChallanRef ||
                "-",
            ]}
            tableColumns={[
              { key: "serial", label: "Sl No", widthClass: "w-16" },
              { key: "name", label: "Item" },
              { key: "unit", label: "Unit", widthClass: "w-16" },
              { key: "hsn", label: "HSN", widthClass: "w-20" },
              { key: "qty", label: "Qty", align: "right", widthClass: "w-24" },
              { key: "rate", label: "Rate", align: "right", widthClass: "w-24" },
              { key: "amount", label: "Amount", align: "right", widthClass: "w-24" },
            ]}
            tableRows={(viewRecord.items || []).map((item, index) => {
              const quantity = Math.max(toNumber(item.quantity), 0);
              const rate = Math.max(toNumber(item.rate), 0);
              return {
                id: item.id ?? index,
                serial: index + 1,
                name: item.name || "-",
                unit: item.unit || "PCS",
                hsn: item.hsn || "-",
                qty: formatQty(quantity),
                rate: formatQty(rate),
                amount: formatQty(quantity * rate),
              };
            })}
            bottomLeftContent={
              <div className="space-y-2 text-xs">
                <p className="font-semibold">Notes</p>
                <p className="whitespace-pre-wrap text-slate-700">
                  {viewRecord.notes || "-"}
                </p>
              </div>
            }
            bottomRightContent={
              <div className="text-right text-xs">
                <p className="font-semibold">Total Quantity</p>
                <p>{formatQty((viewRecord.items || []).reduce((sum, item) => sum + Math.max(toNumber(item.quantity), 0), 0))}</p>
              </div>
            }
            footerCompanyName={company.name || "Bangalore Electronics"}
            hideFooterNote
          />
        )}
      </section>
    </div>
  );
};

export default Consumption;
