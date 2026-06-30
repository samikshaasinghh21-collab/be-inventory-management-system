export const normalizeInventorySourceType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "dc" || normalized === "delivery challan") return "dc";
  if (normalized === "consumption") return "consumption";
  if (normalized === "reallocation" || normalized === "reallocate") return "transfer";
  if (normalized === "receive" || normalized === "receipt" || normalized === "receive goods") {
    return "receive";
  }
  return normalized || "receive";
};

export const getInventorySourceLabel = (sourceType) => {
  const normalized = normalizeInventorySourceType(sourceType);
  if (normalized === "dc") return "DC";
  if (normalized === "consumption") return "Consumption";
  if (normalized === "transfer") return "Transfer";
  return "Receive";
};

export const matchesInventorySourceFilter = (sourceType, filterValue) => {
  const normalizedFilter = normalizeInventorySourceType(filterValue);
  if (!filterValue || normalizedFilter === "all") {
    return true;
  }
  return normalizeInventorySourceType(sourceType) === normalizedFilter;
};

export const buildInventorySourceSummary = (items = []) => {
  const uniqueTypes = [...new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeInventorySourceType(item?.sourceType))
      .filter(Boolean)
  )];
  if (!uniqueTypes.length) {
    return "-";
  }
  if (uniqueTypes.length > 1) {
    return "Mixed";
  }
  return getInventorySourceLabel(uniqueTypes[0]);
};

export const buildInventorySourceSearchText = (items = []) =>
  (Array.isArray(items) ? items : [])
    .flatMap((item) => [
      getInventorySourceLabel(item?.sourceType),
      item?.sourceRef,
      item?.sourceKey,
      item?.name,
      item?.item,
      item?.description,
    ])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
