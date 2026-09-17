import { createElement, isValidElement, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import Button from "../common/Button";
export { default as Button } from "../common/Button";
export { default as Input } from "../common/Input";
export { default as StatusBadge } from "../common/StatusBadge";
export { default as Modal } from "../common/Modal";

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return <header className="ui-page-header"><div className="ui-page-heading"><div>{eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="ui-page-description">{description}</p>}</div>{actions && <div className="ui-page-actions">{actions}</div>}</div>{children}</header>;
}
export function SectionHeader({ title, description, action }) {
  return <div className="ui-section-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
export function Card({ title, description, action, children, className = "" }) {
  return <section className={`ui-card ${className}`}>{title && <SectionHeader title={title} description={description} action={action} />}{children}</section>;
}
export function MetricCard({ label, value, hint, icon, tone = "neutral", onClick }) {
  const Tag = onClick ? "button" : "div";
  const graphic = icon && (isValidElement(icon) ? icon : createElement(icon, { size: 18, "aria-hidden": true }));
  return <Tag className={`ui-metric ui-tone-${tone}`} {...(onClick ? { type: "button", onClick } : {})}><div className="ui-metric-heading"><span>{label}</span>{graphic && <span className="ui-metric-icon">{graphic}</span>}</div><strong>{value ?? "—"}</strong>{hint && <small>{hint}</small>}</Tag>;
}
export function EmptyState({ title = "Nothing here yet", description = "Records will appear here as your team starts working.", action, icon }) {
  const graphic = icon ? (isValidElement(icon) ? icon : createElement(icon, { size: 22, "aria-hidden": true })) : <Inbox size={22} />;
  return <div className="ui-empty"><span className="ui-empty-icon">{graphic}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Skeleton({ rows = 3, className = "" }) {
  return <div role="status" aria-label="Loading content" className={`ui-skeleton-group ${className}`}>{Array.from({ length: rows }, (_, i) => <div className="ui-skeleton" key={i} />)}<span className="app-visually-hidden">Loading…</span></div>;
}
export function FilterBar({ children, className = "" }) { return <div className={`ui-filter-bar ${className}`}>{children}</div>; }
export function Avatar({ name = "User", src, size = "md" }) {
  return src ? <img className={`ui-avatar ui-avatar-${size}`} src={src} alt={name} /> : <span className={`ui-avatar ui-avatar-${size}`} aria-label={name}>{String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase()}</span>;
}
export function Tabs({ items, value, onChange }) {
  const id = useId();
  return <div className="ui-tabs" role="tablist" aria-label="Workspace views">{items.map((item, index) => <button key={item.id} id={`${id}-${item.id}`} type="button" role="tab" aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1} className={value === item.id ? "is-active" : ""} onClick={() => onChange(item.id)} onKeyDown={event => { const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (direction) { event.preventDefault(); const next = items[(index + direction + items.length) % items.length]; onChange(next.id); document.getElementById(`${id}-${next.id}`)?.focus(); } }}>{item.label}{item.count != null && <span>{item.count}</span>}</button>)}</div>;
}
export function ProgressBar({ value = 0, tone = "primary", label }) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={`ui-progress ui-tone-${tone}`} role="progressbar" aria-label={label || "Progress"} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>;
}
export function DataTable({ columns, rows = [], rowKey = "id", emptyTitle = "No records yet", emptyDescription, pageSize = 10, loading = false, searchable = false }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: null, direction: 1 });
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const result = rows.filter(row => !query || columns.some(column => String(row[column.key] ?? "").toLowerCase().includes(query.toLowerCase())));
    if (sort.key) result.sort((a, b) => { const left = a[sort.key] ?? ""; const right = b[sort.key] ?? ""; return sort.direction * (typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true })); });
    return result;
  }, [rows, columns, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <div className="ui-data-table">{searchable && <FilterBar><label className="ui-search"><Search size={16} /><input type="search" aria-label="Search table" placeholder="Search records…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label></FilterBar>}{loading ? <Skeleton rows={5} /> : <div className="ui-table-scroll" tabIndex={0} role="region" aria-label="Records table"><table><thead><tr>{columns.map(column => <th key={column.key} scope="col" style={{ textAlign: column.align || "left" }} aria-sort={sort.key === column.key ? (sort.direction === 1 ? "ascending" : "descending") : undefined}>{column.sortable ? <button type="button" onClick={() => setSort({ key: column.key, direction: sort.key === column.key ? -sort.direction : 1 })}>{column.label}{sort.key === column.key && (sort.direction === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button> : column.label}</th>)}</tr></thead><tbody>{visible.map((row, i) => <tr key={typeof rowKey === "function" ? rowKey(row) : (row[rowKey] ?? i)}>{columns.map(column => <td key={column.key} style={{ textAlign: column.align || "left" }}>{column.render ? column.render(row) : (row[column.key] ?? "—")}</td>)}</tr>)}</tbody></table>{!visible.length && <EmptyState title={query ? "No matching records" : emptyTitle} description={query ? "Try a different search or clear your filters." : emptyDescription} />}</div>}{filtered.length > pageSize && <div className="ui-pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} records</span><div><Button variant="ghost" size="sm" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></Button><span>{currentPage} / {pages}</span><Button variant="ghost" size="sm" aria-label="Next page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></Button></div></div>}</div>;
}
