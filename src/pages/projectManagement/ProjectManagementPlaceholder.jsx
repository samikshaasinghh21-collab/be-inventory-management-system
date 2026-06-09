import { useState } from "react";
import AppIcon from "../../components/layout/AppIcon";
import { projectManagementPageMap } from "./projectManagementData";

const defaultPage = {
  title: "Project Management",
  description: "Manage project workstreams, teams, documents, budgets, and site activity.",
  actionLabel: "Create Record",
  emptyMessage: "No records are available yet.",
};

const ProjectManagementPlaceholder = ({ page }) => {
  const config = projectManagementPageMap[page] || defaultPage;
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
            Project Management
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950 md:text-3xl">
            {config.title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {config.description}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <AppIcon name="plus" className="h-4 w-4" />
          {config.actionLabel}
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Records", "0", "No active entries"],
          ["Drafts", "0", "Ready for setup"],
          ["Last Update", "Today", "Mock workspace"],
        ].map(([label, value, helper]) => (
          <article
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{helper}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {config.title} Register
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Search and create records from this workspace.
            </p>
          </div>
          <label className="relative w-full md:max-w-sm">
            <AppIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <div className="flex min-h-[280px] flex-col items-center justify-center px-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <AppIcon name="folder" className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            {search.trim() ? "No matching records found" : config.emptyMessage}
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            {search.trim()
              ? "Try a different search term or create a new record."
              : "Create the first record to start tracking this project workflow."}
          </p>
        </div>
      </section>
    </div>
  );
};

export default ProjectManagementPlaceholder;
