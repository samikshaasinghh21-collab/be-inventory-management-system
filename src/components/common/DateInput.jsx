import { useEffect, useMemo, useState } from "react";

const pad = (value) => String(value).padStart(2, "0");

const isoToDisplay = (isoDate) => {
  if (!isoDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate));
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

const displayToIso = (displayDate) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(displayDate).trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  const isValid =
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!isValid) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};

const normalizeTyping = (value) => {
  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const DateInput = ({
  value,
  onChange,
  className = "",
  placeholder = "dd/mm/yyyy",
  ...rest
}) => {
  const externalDisplay = useMemo(() => isoToDisplay(value), [value]);
  const [inputValue, setInputValue] = useState(externalDisplay);

  useEffect(() => {
    setInputValue(externalDisplay);
  }, [externalDisplay]);

  const handleChange = (event) => {
    const next = normalizeTyping(event.target.value);
    setInputValue(next);
    const iso = displayToIso(next);
    if (iso) {
      onChange(iso);
      return;
    }
    if (!next.trim()) {
      onChange("");
    }
  };

  const handleBlur = () => {
    const iso = displayToIso(inputValue);
    if (iso) {
      setInputValue(isoToDisplay(iso));
      return;
    }
    if (!inputValue.trim()) {
      return;
    }
    setInputValue(externalDisplay);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="\d{2}/\d{2}/\d{4}"
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      {...rest}
    />
  );
};

export default DateInput;
