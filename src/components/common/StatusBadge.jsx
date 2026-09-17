const inferTone = (status) => {
  const value = String(status || "").trim().toLowerCase().replaceAll("_", " ");
  if (/cancel|inactive|draft|not started|holiday/.test(value)) return "neutral";
  if (/overdue|delay|reject|block|absent|critical|expired|fail/.test(value)) return "danger";
  if (/risk|pending|partial|review|leave|hold|warning/.test(value)) return "warning";
  if (/complet|active|approv|present|success|on track|paid|received|closed/.test(value)) return "success";
  if (/progress|ordered|transit|work/.test(value)) return "info";
  return "neutral";
};
export default function StatusBadge({ status, label, description, color, tone, visible = true, className = "" }) {
  if (!visible) return null;
  const text = label ?? status ?? "Draft";
  const aliases = { green: "success", blue: "info", purple: "info", gray: "neutral", red: "danger", amber: "warning", orange: "warning", yellow: "warning" };
  const resolved = tone || (color && aliases[color]) || inferTone(text);
  return <span className={`app-status-badge app-status-badge--${resolved} ${className}`} title={description || text}><span className="app-status-badge-dot" aria-hidden="true" />{text}</span>;
}
