import { formatQuantity } from "../../../utils/formatters";

const WorkflowSummary = ({
  projectName = "",
  stages = [],
  totalActivities = 0,
}) => {
  const activeStages = stages.filter((stage) => stage.isActive).length;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workflow Summary
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
          {projectName || "Select a project"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {totalActivities} live activity rows across {activeStages} workflow stage{activeStages === 1 ? "" : "s"}.
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
            <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    {stage.timelineLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {stage.count > 0
                      ? `${stage.count} records | ${formatQuantity(stage.totalQty)} qty`
                      : "No activity yet"}
                  </p>
                  {stage.count > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {stage.key === "receive-goods"
                        ? `Received ${formatQuantity(stage.totalReceivedQty)}`
                        : stage.key === "purchase-order"
                          ? `Open PO balance ${formatQuantity(stage.totalBalanceQty)}`
                          : stage.key === "consumption"
                            ? `Consumed ${formatQuantity(stage.totalQty)}`
                            : "See transaction rows for details"}
                    </p>
                  ) : null}
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
