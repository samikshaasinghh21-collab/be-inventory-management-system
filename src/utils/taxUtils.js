import { roundCurrencyValue, roundUnitPrice } from "./formatters";

export const TAX_OPTIONS = [5, 12, 18, 28];

export const parseTaxPercentage = (value) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const match = String(value).trim().match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return 0;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatTaxPercentage = (value) => {
  const parsed = parseTaxPercentage(value);
  return `${Number.isInteger(parsed) ? parsed : Number(parsed.toFixed(2))}%`;
};

export const getItemUnitPrice = (item = {}) =>
  roundUnitPrice(item.unitPrice ?? item.rate ?? 0);

export const getItemQuantity = (item = {}) =>
  Number(item.quantity ?? item.qty ?? 0) || 0;

export const calculateLineSubtotal = (item = {}) =>
  getItemQuantity(item) * getItemUnitPrice(item);

export const calculateLineTax = (item = {}) =>
  (calculateLineSubtotal(item) * parseTaxPercentage(item.taxPercentage ?? item.gst)) / 100;

export const buildLineTaxBreakdown = (item = {}, options = {}) => {
  const quantity = getItemQuantity(item);
  const unitPrice = getItemUnitPrice(item);
  const taxPercentage = parseTaxPercentage(item.taxPercentage ?? item.gst);
  const taxMode = options.taxMode === "inter" ? "inter" : "intra";
  const taxableAmount = roundCurrencyValue(quantity * unitPrice);
  const gstAmount = roundCurrencyValue((taxableAmount * taxPercentage) / 100);
  const halfRate = taxPercentage / 2;
  const halfAmount = roundCurrencyValue(gstAmount / 2);

  return {
    taxableAmount,
    gstAmount,
    cgstPercent: taxMode === "inter" ? 0 : halfRate,
    sgstPercent: taxMode === "inter" ? 0 : halfRate,
    igstPercent: taxMode === "inter" ? taxPercentage : 0,
    cgstAmount: taxMode === "inter" ? 0 : halfAmount,
    sgstAmount: taxMode === "inter" ? 0 : halfAmount,
    igstAmount: taxMode === "inter" ? gstAmount : 0,
  };
};

export const buildGstSummary = (items = [], options = {}) => {
  const taxMode = options.taxMode === "inter" ? "inter" : "intra";
  const summary = {
    subtotal: 0,
    totalTax: 0,
    total: 0,
    taxMode,
    cgstGroups: [],
    sgstGroups: [],
    igstGroups: [],
  };

  const groups = new Map();
  for (const item of items) {
    const lineSubtotal = calculateLineSubtotal(item);
    const taxPercentage = parseTaxPercentage(item.taxPercentage ?? item.gst);
    const taxAmount = (lineSubtotal * taxPercentage) / 100;
    summary.subtotal += lineSubtotal;
    summary.totalTax += taxAmount;

    if (taxPercentage > 0 && taxAmount > 0) {
      const groupRate = taxMode === "inter" ? taxPercentage : taxPercentage / 2;
      const groupAmount = taxMode === "inter" ? taxAmount : taxAmount / 2;
      const groupKey = groupRate.toFixed(2);
      const current = groups.get(groupKey) ?? { rate: groupRate, amount: 0 };
      current.amount += groupAmount;
      groups.set(groupKey, current);
    }
  }

  const orderedGroups = Array.from(groups.values()).sort((a, b) => a.rate - b.rate);
  if (taxMode === "inter") {
    summary.igstGroups = orderedGroups.map((group) => ({
      ...group,
      amount: roundCurrencyValue(group.amount),
    }));
  } else {
    summary.cgstGroups = orderedGroups.map((group) => ({
      ...group,
      amount: roundCurrencyValue(group.amount),
    }));
    summary.sgstGroups = orderedGroups.map((group) => ({
      ...group,
      amount: roundCurrencyValue(group.amount),
    }));
  }
  summary.subtotal = roundCurrencyValue(summary.subtotal);
  summary.totalTax = roundCurrencyValue(summary.totalTax);
  summary.total = roundCurrencyValue(summary.subtotal + summary.totalTax);

  return summary;
};
