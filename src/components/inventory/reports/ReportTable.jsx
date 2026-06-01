import {
  formatReportDate,
  getStatusBadgeClass,
} from "./reportUtils";

const PAGE_SIZE = 10;

const buildPageNumbers = (currentPage, totalPages) => {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const normalizedStart = Math.max(1, end - 4);
  return Array.from(
    { length: end - normalizedStart + 1 },
    (_, index) => normalizedStart + index
  );
};

const ReportTable = ({
  rows = [],
  loading = false,
  currentPage = 1,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(startIndex, startIndex + PAGE_SIZE);
  const startCount = rows.length === 0 ? 0 : startIndex + 1;
  const endCount = Math.min(startIndex + PAGE_SIZE, rows.length);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
            Project Activity Report
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {rows.length
              ? `${rows.length} live activity rows available`
              : "No activity rows match the current filters"}
          </p>
        </div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
          Live Data
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1320px] text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left font-semibold min-w-[110px]">Date</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Project</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[170px]">Activity</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Ref No</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Product</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[170px]">Vendor</th>
              <th className="px-4 py-3 text-right font-semibold min-w-[100px]">Total Qty</th>
              <th className="px-4 py-3 text-right font-semibold min-w-[110px]">Received Qty</th>
              <th className="px-4 py-3 text-right font-semibold min-w-[110px]">Available Qty</th>
              <th className="px-4 py-3 text-right font-semibold min-w-[110px]">Balance Qty</th>
              <th className="px-4 py-3 text-right font-semibold min-w-[90px]">Moved Qty</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Location</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="13" className="px-4 py-10 text-center text-slate-500">
                  Loading report data...
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan="13" className="px-4 py-10 text-center text-slate-500">
                  No report rows found for the selected filters.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 text-slate-700">
                    {formatReportDate(row.date)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.projectName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${row.activityBadgeClass}`}
                    >
                      {row.activityLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.refNo}</td>
                  <td className="px-4 py-3 text-slate-700">{row.product}</td>
                  <td className="px-4 py-3 text-slate-700">{row.vendorName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {row.totalQty === null
                      ? "-"
                      : Number(row.totalQty || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {row.receivedQty === null
                      ? "-"
                      : Number(row.receivedQty || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {row.availableQty === null
                      ? "-"
                      : Number(row.availableQty || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {row.balanceQty === null
                      ? "-"
                      : Number(row.balanceQty || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {Number(row.qty || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.location}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                        row.status
                      )}`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm">
        <p className="text-slate-500">
          Showing {startCount}-{endCount} of {rows.length} records
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>

          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`grid h-10 w-10 place-items-center rounded-lg border text-sm font-medium transition ${
                pageNumber === safePage
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {pageNumber}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
};

export default ReportTable;
