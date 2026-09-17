import { useId } from "react";
export default function Input({ label, helperText, error, id, className = "", required, ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <div className="input-group">{label && <label className="input-label" htmlFor={inputId}>{label}{required && <span className="ui-required"> *</span>}</label>}<input id={inputId} className={`input ${className}`} required={required} aria-invalid={Boolean(error)} aria-describedby={error || helperText ? `${inputId}-help` : undefined} {...props} />{(error || helperText) && <small id={`${inputId}-help`} className={error ? "ui-field-error" : "ui-field-help"}>{error || helperText}</small>}</div>;
}
