import DateInput from "../../common/DateInput";
import { REPORT_ACTIVITY_TYPES } from "./reportUtils";

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const ReportFilters = ({
  projects = [],
  vendors = [],
  locations = [],
  locationTags = [],
  statuses = [],
  filters,
  onFieldChange,
  onToggleType,
  onApply,
  onReset,
  disabled = false,
}) => {
  const selectedTypes = new Set(filters.types || []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <label className="text-sm font-medium text-slate-700">
            Project <span className="text-rose-500">*</span>
          </label>
          <select
            value={filters.projectId}
            onChange={(event) => onFieldChange("projectId", event.target.value)}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">
              {projects.length ? "Select project" : "No projects available"}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className="text-sm font-medium text-slate-700">From Date</label>
          <DateInput
            value={filters.fromDate}
            onChange={(value) => onFieldChange("fromDate", value)}
            className={inputClass}
            disabled={disabled}
            showCalendarButton={!disabled}
          />
        </div>

        <div className="xl:col-span-2">
          <label className="text-sm font-medium text-slate-700">To Date</label>
          <DateInput
            value={filters.toDate}
            onChange={(value) => onFieldChange("toDate", value)}
            className={inputClass}
            disabled={disabled}
            showCalendarButton={!disabled}
          />
        </div>

        <div className="xl:col-span-2">
          <label className="text-sm font-medium text-slate-700">Location Tag</label>
          <select
            value={filters.locationTag}
            onChange={(event) => onFieldChange("locationTag", event.target.value)}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">All Location Tags</option>
            {locationTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className="text-sm font-medium text-slate-700">Location</label>
          <select
            value={filters.locationId}
            onChange={(event) => onFieldChange("locationId", event.target.value)}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">All Locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}{location.code ? ` - ${location.code}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-5">
          <label className="text-sm font-medium text-slate-700">Activity Type</label>
          <div className="mt-3 flex flex-wrap gap-2">
            {REPORT_ACTIVITY_TYPES.map((activity) => {
              const isSelected = selectedTypes.has(activity.key);
              return (
                <label
                  key={activity.key}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm leading-5 transition ${
                    isSelected
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleType(activity.key)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    disabled={disabled}
                  />
                  <span>{activity.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-3">
          <label className="text-sm font-medium text-slate-700">Vendor</label>
          <select
            value={filters.vendorId}
            onChange={(event) => onFieldChange("vendorId", event.target.value)}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">All Vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className="text-sm font-medium text-slate-700">Product</label>
          <input
            type="search"
            value={filters.productQuery}
            onChange={(event) => onFieldChange("productQuery", event.target.value)}
            placeholder="Search product"
            className={inputClass}
            disabled={disabled}
          />
        </div>

        <div className="xl:col-span-2">
          <label className="text-sm font-medium text-slate-700">Status</label>
          <select
            value={filters.status}
            onChange={(event) => onFieldChange("status", event.target.value)}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">All Status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="app-btn app-btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Apply Filters
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="app-btn app-btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reset
        </button>
      </div>
    </section>
  );
};

export default ReportFilters;
