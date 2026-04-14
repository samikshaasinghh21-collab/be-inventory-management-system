const WorkflowSummary = ({
  projectName = "",
  stages = [],
  totalActivities = 0,
  totalQuantity = 0,
}) => {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          Workflow Summary
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          {projectName || "Select a project"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {totalActivities} activities across {totalQuantity.toLocaleString("en-IN")} quantity.
        </p>
      </div>

      <div className="relative mt-5 space-y-1">
        <div className="absolute bottom-3 left-[14px] top-3 w-px bg-slate-200" />
        {stages.map((stage) => (
          <div key={stage.key} className="relative flex gap-3 py-3">
            <div className="relative z-10 pt-1">
              <span
                className={`block h-7 w-7 rounded-full border-4 border-white shadow ${
                  stage.isActive ? stage.dotClass : "bg-slate-300"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    {stage.timelineLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {stage.count > 0
                      ? `${stage.count} records • ${stage.totalQty.toLocaleString("en-IN")} qty`
                      : "No activity yet"}
                  </p>
                  {stage.latestRefNo ? (
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Latest {stage.latestRefNo}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    stage.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {stage.latestLabel}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default WorkflowSummary;
