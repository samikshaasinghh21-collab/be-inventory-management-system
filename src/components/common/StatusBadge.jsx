import React from "react";

const COLOR_VARIANTS = {
  green: {
    container: "border-green-200 bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  blue: {
    container: "border-blue-200 bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  purple: {
    container: "border-purple-200 bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
  },
  gray: {
    container: "border-slate-200 bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
  },
};

const getVariant = (color) => COLOR_VARIANTS[color] || COLOR_VARIANTS.gray;

export default function StatusBadge({
  label,
  description,
  color = "gray",
  visible = true,
}) {
  if (!visible) {
    return null;
  }

  const variant = getVariant(color);
  const title = description || label || "";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium shadow-sm transition ${variant.container}`}
      title={title}
      aria-label={title || label || "Status badge"}
    >
      <span
        className={`h-2 w-2 rounded-full ${variant.dot}`}
        aria-hidden="true"
      />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
