import React from "react";

export default function StatusBadge({
  label,
  description,
  color = "gray",
  visible = true,
}) {
  if (!visible) {
    return null;
  }

  const title = description || label || "";
  const safeColor = ["green", "blue", "purple", "gray"].includes(color)
    ? color
    : "gray";

  return (
    <span
      className={`app-status-badge app-status-badge--${safeColor}`}
      title={title}
      aria-label={title || label || "Status badge"}
    >
      <span className="app-status-badge-dot" aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
