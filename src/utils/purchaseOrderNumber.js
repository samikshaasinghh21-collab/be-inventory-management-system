export const generateNextPurchaseOrderNumber = (
  records = [],
  dateValue = new Date().toISOString().slice(0, 10)
) => {
  const parsedDate = new Date(dateValue || Date.now());
  const year = Number.isNaN(parsedDate.getTime())
    ? new Date().getFullYear()
    : parsedDate.getFullYear();
  const prefix = `PO-${year}-`;
  const pattern = new RegExp(`^PO-${year}-(\\d+)$`, "i");
  const used = new Set();
  let maxSequence = 0;

  for (const record of records) {
    const currentNumber = String(record?.poNumber ?? record?.PONumber ?? "").trim();
    if (!currentNumber) {
      continue;
    }
    used.add(currentNumber.toUpperCase());
    const match = currentNumber.match(pattern);
    if (!match) {
      continue;
    }
    const parsedSequence = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsedSequence)) {
      maxSequence = Math.max(maxSequence, parsedSequence);
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = `${prefix}${String(nextSequence).padStart(4, "0")}`;
  while (used.has(candidate.toUpperCase())) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(4, "0")}`;
  }

  return candidate;
};
