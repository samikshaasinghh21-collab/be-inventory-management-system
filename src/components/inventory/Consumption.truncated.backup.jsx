import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchBoqs } from "../../services/boqApi";
import {
  createConsumption,
  deleteConsumption,
  fetchConsumptions,
  updateConsumption,
} from "../../services/consumptionApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchProjects } from "../../services/projectsApi";
import { getProjects as getCachedProjects } from "../../services/projectsStore";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import DocumentViewPanel from "./DocumentViewPanel";

const pagePanelClass =
  "rounded-[20px] border border-slate-200/80 bg-white/95 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.28)]";

const createRowId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createFormState = (consumptionNumber = "") => ({
  consumptionNumber,
  projectId: "",
  locationId: "",
  consumptionDate: new Date().toISOString().slice(0, 10),
  issuedBy: "Store Keeper",
  status: "Logged",
  notes: "",
});

const toQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInputQuantity = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "";
  }
  return parsed;
};

const createLineItem = (overrides = {}) => ({
  id: overrides.id ?? createRowId(),
  boqItemId: overrides.boqItemId ?? null,
  name: overrides.name ?? "",
  unit: overrides.unit ?? "PCS",
  receivedQty: toQuantity(overrides.receivedQty ?? 0),
  quantity: toInputQuantity(overrides.quantity),
  notes: overrides.notes ?? "",
});

const formatQuantity = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const getMaterialKey = (item = {}) =>
  `${String(item.name ?? "")
    .trim()
    .toLowerCase()}::${String(item.unit ?? "PCS")
    .trim()
    .toUpperCase()}`;

const getBalanceQty = (item = {}) =>
  Math.max(toQuantity(item.receivedQty) - toQuantity(item.quantity), 0);

const getRecordSortValue = (record = {}) => {
  const rawValue =
    record.updatedAt ??
    record.date ??
    record.consumptionDate ??
    record.createdAt ??
    null;
  const parsed = rawValue ? new Date(rawValue).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const getVersionValue = (version) => {
  const parsed = Number.parseFloat(version);
  return Number.isFinite(parsed) ? parsed : 0;
};

const maxQtyWithinReceived = (quantity, receivedQty) => {
  const nextQuantity = Math.max(toQuantity(quantity), 0);
  if (receivedQty > 0) {
    return Math.min(nextQuantity, receivedQty);
  }
  return nextQuantity;
};

const generateNextConsumptionNumber = (records = []) => {
  const year = new Date().getFullYear();
  const prefix = `CON-${year}-`;
  const sequencePattern = new RegExp(`^CON-${year}-(\\d+)$`, "i");
  const usedNumbers = new Set();
  let maxSequence = 0;

  for (const record of records) {
    const currentNumber = String(record?.consumptionNumber ?? "").trim();
    if (!currentNumber) {
      continue;
    }

    usedNumbers.add(currentNumber.toUpperCase());
    const match = currentNumber.match(sequencePattern);
    if (!match) {
      continue;
    }

    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      maxSequence = Math.max(maxSequence, parsed);
    }
  }

  let sequence = maxSequence + 1;
  let candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
  while (usedNumbers.has(candidate.toUpperCase())) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(3, "0")}`;
  }

  return candidate;
};

const filterLocationsByProject = (projectId, locations = []) => {
  if (!projectId) {
    return locations;
  }
  return locations.filter(
    (location) =>
      !location.projectId ||
      String(location.projectId) === String(projectId)
  );
};

const pickProjectBoq = (projectId, records = []) => {
  if (!projectId) {
    return null;
  }

  const statusRank = {
    Approved: 3,
    Draft: 2,
    Closed: 1,
  };

  const matchingRecords = records.filter(
    (record) => String(record.projectId) === String(projectId)
  );

  if (!matchingRecords.length) {
    return null;
  }

  return [...matchingRecords].sort((left, right) => {
    const statusDiff =
      (statusRank[right.status] ?? 0) - (statusRank[left.status] ?? 0);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const versionDiff =
      getVersionValue(right.version) - getVersionValue(left.version);
    if (versionDiff !== 0) {
      return versionDiff;
    }

    const dateDiff = getRecordSortValue(right) - getRecordSortValue(left);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return toQuantity(right.id) - toQuantity(left.id);
  })[0];
};

const buildItemsFromProjectBoq = (
  projectId,
  boqRecords = [],
  existingItems = []
) => {
  const selectedBoq = pickProjectBoq(projectId, boqRecords);
  const existingByKey = new Map();

  for (const item of existingItems) {
    const key = getMaterialKey(item);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, []);
    }
    existingByKey.get(key).push(item);
  }

  const mappedBoqItems = (selectedBoq?.items ?? []).map((boqItem) => {
    const key = getMaterialKey(boqItem);
    const matches = existingByKey.get(key) ?? [];
    const existing = matches.shift() ?? null;
    if (!matches.length) {
      existingByKey.delete(key);
    } else {
      existingByKey.set(key, matches);
    }

    return createLineItem({
      id: existing?.id ?? boqItem.id ?? createRowId(),
      boqItemId: boqItem.id ?? boqItem.LineItemId ?? key,
      name: boqItem.name ?? "",
      unit: boqItem.unit ?? "PCS",
      receivedQty: boqItem.quantity ?? 0,
      quantity: existing?.quantity ?? "",
      notes: existing?.notes ?? boqItem.notes ?? "",
    });
  });

  const extraItems = Array.from(existingByKey.values())
    .flat()
    .map((item) =>
      createLineItem({
        id: item.id,
        boqItemId: item.boqItemId ?? null,
        name: item.name ?? "",
        unit: item.unit ?? "PCS",
        receivedQty: Math.max(
          toQuantity(item.receivedQty),
          toQuantity(item.quantity)
        ),
        quantity: item.quantity ?? "",
        notes: item.notes ?? "",
      })
    );

  return mappedBoqItems.length || extraItems.length
    ? [...mappedBoqItems, ...extraItems]
    : [];
};

const issuedByOptions = [
  "Store Keeper",
  "Site Engineer",
  "Supervisor",
  "Project Manager",
];

const statusOptions = ["Logged", "Reviewed", "Approved"];

const Consumption = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";

  const [projectOptions, setProjectOptions] = useState([]);
  const [locationOptions, setLocationOptions] = useState([]);
  const [boqRecords, setBoqRecords] = useState([]);
  const [consumptionRecords, setConsumptionRecords] = useState([]);
  const [form, setForm] = useState(() => createFormState());
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshingLocations, setRefreshingLocations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewRecord, setViewRecord] = useState(null);
