export const parseDateValue = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const exactIsoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (exactIsoDate) {
    const year = Number(exactIsoDate[1]);
    const month = Number(exactIsoDate[2]);
    const day = Number(exactIsoDate[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const separatedDateMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(trimmed);
  if (separatedDateMatch) {
    const first = Number(separatedDateMatch[1]);
    const second = Number(separatedDateMatch[2]);
    const year =
      separatedDateMatch[3].length === 2
        ? Number(`20${separatedDateMatch[3]}`)
        : Number(separatedDateMatch[3]);
    const isLegacyUsDate = first <= 12 && second > 12;
    const day = isLegacyUsDate ? second : first;
    const month = isLegacyUsDate ? first : second;
    const date = new Date(year, month - 1, day);
    const isValid =
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;
    return isValid ? date : null;
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

const pad = (value) => String(value).padStart(2, "0");

export const formatDate = (value) => {
  const parts = getDateParts(value);
  if (!parts) return "-";
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
};

export const formatDateDDMMYYYY = formatDate;

export const formatDateTimeDDMMYYYY = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "-";
  return `${formatDate(parsed)} ${parsed.toLocaleTimeString("en-GB", {
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
