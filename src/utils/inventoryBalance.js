const toQuantity = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
};

const hasQuantityValue = (value) =>
  value !== null && value !== undefined && value !== "";

export const calculateFinalAvailableQty = (row = {}) => {
  const rawSourceQty = row.sourceQty ?? row.SourceQty;
  if (!hasQuantityValue(rawSourceQty)) {
    return toQuantity(
      row.availableQty ??
        row.AvailableQty ??
        row.remainingAvailableQty ??
        row.RemainingAvailableQty
    );
  }

  const sourceQty = toQuantity(rawSourceQty);
  const consumedQty = toQuantity(row.consumedQty ?? row.ConsumedQty);
  const movedOutQty = toQuantity(
    row.reallocatedQty ??
      row.ReallocatedQty ??
      row.adjustedQty ??
      row.AdjustedQty
  );

  return Math.max(sourceQty - consumedQty - movedOutQty, 0);
};
