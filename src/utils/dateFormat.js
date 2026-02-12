<<<<<<< HEAD
const pad = (value) => String(value).padStart(2, "0");

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const str = String(value).trim();
  if (!str) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

export const formatDateDDMMYYYY = (value) => {
  const date = parseDateValue(value);
  if (!date) {
    return "-";
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const formatDateTimeDDMMYYYY = (value) => {
  const date = parseDateValue(value);
  if (!date) {
    return "-";
  }
  const datePart = formatDateDDMMYYYY(date);
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${datePart} ${timePart}`;
};
=======
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  if (typeof value === "string") {
    const match = value.match(DATE_ONLY_PATTERN);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year.slice(-2)}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export { formatDate, formatDateTime };
>>>>>>> ab340f3402952da5e02c7b117ed4c40f3d1549b6
