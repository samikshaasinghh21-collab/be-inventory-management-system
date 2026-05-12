import { useEffect } from "react";

const IGNORED_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "hidden",
  "image",
  "month",
  "password",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

export default function useUppercaseInputs() {
  useEffect(() => {
    const handleInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (target.disabled || target.readOnly) {
        return;
      }

      if (target instanceof HTMLInputElement) {
        const type = (target.type || "text").toLowerCase();
        if (IGNORED_INPUT_TYPES.has(type)) {
          return;
        }
      }

      const value = target.value;
      const upperValue = value.toUpperCase();
      if (value !== upperValue) {
        target.value = upperValue;
      }
    };

    document.addEventListener("input", handleInput, true);
    return () => document.removeEventListener("input", handleInput, true);
  }, []);
}
