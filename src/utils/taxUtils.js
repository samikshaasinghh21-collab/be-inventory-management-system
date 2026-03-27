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
  Number(item.unitPrice ?? item.rate ?? 0) || 0;

export const getItemQuantity = (item = {}) =>
  Number(item.quantity ?? item.qty ?? 0) || 0;

export const calculateLineSubtotal = (item = {}) =>
  getItemQuantity(item) * getItemUnitPrice(item);

export const calculateLineTax = (item = {}) =>
  (calculateLineSubtotal(item) * parseTaxPercentage(item.taxPercentage ?? item.gst)) / 100;

export const buildGstSummary = (items = []) => {
  const summary = {
    subtotal: 0,
    totalTax: 0,
    total: 0,
    cgstGroups: [],
    sgstGroups: [],
  };

  const groups = new Map();
  for (const item of items) {
    const lineSubtotal = calculateLineSubtotal(item);
    const taxPercentage = parseTaxPercentage(item.taxPercentage ?? item.gst);
    const taxAmount = (lineSubtotal * taxPercentage) / 100;
    summary.subtotal += lineSubtotal;
    summary.totalTax += taxAmount;

    if (taxPercentage > 0 && taxAmount > 0) {
      const splitRate = taxPercentage / 2;
      const splitAmount = taxAmount / 2;
      const groupKey = splitRate.toFixed(2);
      const current = groups.get(groupKey) ?? {
        rate: splitRate,
        amount: 0,
      };
      current.amount += splitAmount;
      groups.set(groupKey, current);
    }
  }

  const orderedGroups = Array.from(groups.values()).sort((a, b) => a.rate - b.rate);
  summary.cgstGroups = orderedGroups.map((group) => ({ ...group }));
  summary.sgstGroups = orderedGroups.map((group) => ({ ...group }));
  summary.total = summary.subtotal + summary.totalTax;

  return summary;
};
