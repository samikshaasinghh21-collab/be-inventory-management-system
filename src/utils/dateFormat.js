const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDateParts = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  if (parsed instanceof Date) {
    return {
      day: parsed.getDate(),
      month: parsed.getMonth() + 1,
      year: parsed.getFullYear(),
    };
  }
  return parsed;
};

const isValidDate = (value) => Boolean(getDateParts(value));

const pad = (value) => String(value).padStart(2, "0");

export const formatDate = (value) => {
  const parts = getDateParts(value);
  if (!parts) return "-";
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
};

export const formatDateDDMMYYYY = formatDate;

export const formatDateTimeDDMMYYYY = (value) => {
  if (!isValidDate(value)) return "-";
  const date = new Date(value);
  return `${formatDate(value)} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

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
