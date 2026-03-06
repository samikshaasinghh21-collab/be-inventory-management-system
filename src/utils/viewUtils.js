import { openStyledView } from "./printUtils";

const formatValue = (value) => {
  if (value === undefined || value === null || value === "") return "-";
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "-";
  }
  return String(value);
};

const rowsToHtml = (rows = []) =>
  rows
    .map(
      ({ label, value }) => `
        <div class="details-row">
          <span class="details-label">${label}</span>
          <span class="details-value">${formatValue(value)}</span>
        </div>
      `
    )
    .join("");

export const openRecordView = ({
  title = "Record",
  subtitle,
  rows = [],
  metaRows,
  bodyHtml = "",
  logoUrl,
  brandName,
  brandDescription,
  autoPrint = false,
}) => {
  if (typeof document === "undefined") {
    return;
  }
  const viewWindow = openStyledView({
    title,
    subtitle,
    metaRows,
    logoUrl,
    brandName,
    brandDescription,
    body: `${rowsToHtml(rows)}${bodyHtml}`,
  });
  if (autoPrint && viewWindow) {
    viewWindow.print();
    viewWindow.close();
  }
};
