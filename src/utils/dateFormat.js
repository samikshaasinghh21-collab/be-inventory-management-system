const isValidDate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

export const formatDate = (value) => {
  if (!isValidDate(value)) return "-";
  const date = new Date(value);
  return date.toLocaleDateString("en-GB");
};

export const formatDateDDMMYYYY = formatDate;

export const formatDateTimeDDMMYYYY = (value) => {
  if (!isValidDate(value)) return "-";
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const pad = (value) => String(value).padStart(2, "0");

const ISO_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|([+-]\d{2}(?::?\d{2})?))?)?$/;

const parseIsoDateTime = (value) => {
  if (!value) return null;
  const match = ISO_DATETIME_RE.exec(String(value).trim());
  if (!match) {
    return null;
  }
  const [
    ,
    year,
    month,
    day,
    hour = "00",
    minute = "00",
    second = "00",
  ] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
};

const formatDateParts = ({ day, month, year }) =>
  `${pad(day)}/${pad(month)}/${year}`;

const formatTimeParts = ({ hour, minute }) => {
  const normalizedHour = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${normalizedHour}:${pad(minute)} ${suffix}`;
};

const hasTimePart = (parts) =>
  Boolean(parts.hour || parts.minute || parts.second);

const formatTimelineValue = (value) => {
  const parts = parseIsoDateTime(value);
  if (!parts) {
    return null;
  }
  if (hasTimePart(parts)) {
    return formatTimeParts(parts);
  }
  return formatDateParts(parts);
};

export const formatTimelineRange = (start, end, fallback = "—") => {
  const startLabel = formatTimelineValue(start);
  const endLabel = formatTimelineValue(end);
  if (startLabel && endLabel) {
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel || endLabel || fallback;
};
