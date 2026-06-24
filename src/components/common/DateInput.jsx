import { useEffect, useMemo, useState } from "react";
import { parseDateValue } from "../../utils/dateFormat";

const pad = (value) => String(value).padStart(2, "0");

const toIsoDateValue = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const directMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }
  const parsed = parseDateValue(trimmed);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

const isoToDisplay = (isoDate) => {
  const normalized = toIsoDateValue(isoDate);
  if (!normalized) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
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
  showCalendarButton = true,
  ...rest
}) => {
  const nativeValue = useMemo(() => toIsoDateValue(value), [value]);
  const externalDisplay = useMemo(() => isoToDisplay(nativeValue), [nativeValue]);
  const [inputValue, setInputValue] = useState(externalDisplay);
  const [hiddenId] = useState(() => `date-input-${Math.random().toString(36).slice(2, 8)}`);

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

  const openNativePicker = () => {
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.showPicker?.();
  };

  const handleNativeChange = (event) => {
    const iso = event.target.value;
    const display = isoToDisplay(iso);
    setInputValue(display);
    if (iso) {
      onChange(iso);
    } else {
      onChange("");
    }
  };

  return (
    <div className="relative flex items-center gap-2">
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
      {showCalendarButton && (
        <>
          <input
            id={hiddenId}
            type="date"
            value={nativeValue}
            onChange={handleNativeChange}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={openNativePicker}
            className="p-2 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Open calendar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 11h18" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};

export default DateInput;
