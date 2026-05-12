export const roundCurrencyValue = (value, fractionDigits = 2) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  const factor = 10 ** fractionDigits;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};

export const roundUnitPrice = (value) => {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
};

export const formatInrCurrency = (value) => {
  const amount = roundCurrencyValue(value);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `\u20B9${amount.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  }
};

export const formatCustomerName = (value = "", fallback = "") => {
  const normalized = String(value ?? fallback ?? "").trim();
  return normalized ? normalized.toUpperCase() : fallback;
};
