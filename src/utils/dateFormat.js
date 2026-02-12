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
