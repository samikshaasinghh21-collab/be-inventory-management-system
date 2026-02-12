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
