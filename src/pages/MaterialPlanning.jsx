import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useMrpPlanning from "../hooks/useMrpPlanning";
import useSettings from "../hooks/useSettings";

const statusMeta = {
  ok: {
    label: "OK",
    cardClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pillClass: "bg-emerald-100 text-emerald-700",
  },
  low: {
    label: "Watch",
    cardClass: "border-amber-200 bg-amber-50 text-amber-700",
    pillClass: "bg-amber-100 text-amber-700",
  },
  shortage: {
    label: "Shortage",
    cardClass: "border-red-200 bg-red-50 text-red-700",
    pillClass: "bg-red-100 text-red-700",
  },
};

const formatDate = (value) => {
  if (!value) {
    return "No deadline";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const MaterialPlanning = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";
  const { snapshot, loading, error } = useMrpPlanning();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectId = searchParams.get("projectId") || "all";
  const selectedProductId = searchParams.get("productId") || "all";

  const formatQuantity = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    });

  const formatCurrency = (value) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(Number(value || 0));
    } catch {
      return `${currency} ${Number(value || 0).toLocaleString("en-IN")}`;
    }
  };

  const filteredProjects = useMemo(() => {
    return snapshot.shortageResults.projects
      .filter((project) => {
        if (
          selectedProjectId !== "all" &&
          String(project.projectId) !== String(selectedProjectId)
        ) {
          return false;
        }

        if (selectedProductId === "all") {
          return true;
        }

        return project.materials.some(
          (material) => String(material.productId) === String(selectedProductId)
        );
      })
      .map((project) => ({
        ...project,
        materials:
          selectedProductId === "all"
            ? project.materials
            : project.materials.filter(
                (material) =>
                  String(material.productId) === String(selectedProductId)
              ),
      }));
  }, [selectedProductId, selectedProjectId, snapshot.shortageResults.projects]);

  const filteredRecommendations = useMemo(() => {
    return snapshot.recommendations.filter((recommendation) => {
      if (
        selectedProjectId !== "all" &&
        String(recommendation.projectId) !== String(selectedProjectId)
      ) {
        return false;
      }

      if (
        selectedProductId !== "all" &&
        String(recommendation.productId) !== String(selectedProductId)
      ) {
        return false;
      }

      return true;
    });
  }, [selectedProductId, selectedProjectId, snapshot.recommendations]);

  const visibleForecast = useMemo(() => {
    return snapshot.forecast.atRisk.filter((item) => {
      if (
        selectedProductId !== "all" &&
        String(item.productId) !== String(selectedProductId)
      ) {
        return false;
      }
      return true;
    });
  }, [selectedProductId, snapshot.forecast.atRisk]);

  const recommendationLookup = useMemo(() => {
    return filteredRecommendations.reduce((acc, recommendation) => {
      acc[`${recommendation.projectId}::${recommendation.materialKey}`] =
        recommendation;
      return acc;
    }, {});
  }, [filteredRecommendations]);

  const projectOptions = snapshot.shortageResults.projects.map((project) => ({
    id: project.projectId,
    name: project.projectName,
  }));

  const summaryCards = [
    {
      id: "projects",
      label: "Projects Planned",
      value: snapshot.summary.projectCount,
      hint: "Active project demand in MRP",
      accent: "from-slate-900 to-slate-700 text-white",
    },
    {
      id: "shortages",
      label: "Material Shortages",
      value: snapshot.summary.shortageCount,
      hint: "Critical lines requiring action",
      accent: "from-red-500 to-orange-500 text-white",
    },
    {
      id: "recommended",
      label: "Recommended Orders",
      value: formatQuantity(snapshot.summary.totalRecommendedOrder),
      hint: `${snapshot.summary.recommendationCount} PO suggestions`,
      accent: "from-blue-600 to-cyan-500 text-white",
    },
    {
      id: "forecast",
      label: "Forecast Risks",
      value: snapshot.summary.atRiskForecastCount,
      hint: "Materials nearing depletion",
      accent: "from-amber-400 to-yellow-300 text-slate-900",
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(140deg,#f8fafc_0%,#dbeafe_45%,#eff6ff_100%)] px-5 py-5 shadow-sm md:px-6 md:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Material Planning
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              MRP Command Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Plan project demand against live stock, open purchase orders, and
              recent consumption so shortages surface before work stops.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/inventory/projects")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Open Projects
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/purchase-order-register")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Purchase Register
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article
            key={card.id}
            className={`rounded-2xl bg-gradient-to-br px-4 py-4 shadow-sm ${card.accent}`}
          >
            <p className="text-xs uppercase tracking-[0.18em] opacity-80">
              {card.label}
            </p>
            <p className="mt-3 text-3xl font-semibold">{card.value}</p>
            <p className="mt-2 text-sm opacity-85">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[240px_240px_auto]">
          <label>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Filter Project
            </span>
            <select
              value={selectedProjectId}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.value === "all") {
                  next.delete("projectId");
                } else {
                  next.set("projectId", event.target.value);
                }
                setSearchParams(next);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All projects</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Current Filter
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {selectedProjectId === "all"
                ? "All active projects"
                : projectOptions.find(
                    (project) => String(project.id) === String(selectedProjectId)
                  )?.name || "Selected project"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedProductId === "all"
                ? "Showing every tracked material"
                : "Focused on a single material from notification navigation"}
            </p>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Forecast
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Depletion Watchlist
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {visibleForecast.length} at risk
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {visibleForecast.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No immediate depletion risks in the current planning window.
              </div>
            ) : (
              visibleForecast.slice(0, 5).map((item) => (
                <div
                  key={item.materialKey}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {item.productName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatQuantity(item.currentStock)} {item.unit} in stock |{" "}
                      {formatQuantity(item.averageDailyUsage)} / day usage
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      Expected depletion {formatDate(item.depletionDate)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.status === "critical"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {Math.max(1, Math.ceil(Number(item.daysRemaining || 0)))} days
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Procurement
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Recommended Purchase Orders
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {filteredRecommendations.length} actions
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {filteredRecommendations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No purchase orders are recommended right now.
              </div>
            ) : (
              filteredRecommendations.slice(0, 5).map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {recommendation.productName}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {recommendation.projectName} | order{" "}
                        {formatQuantity(recommendation.recommendedOrder)}{" "}
                        {recommendation.unit}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {recommendation.vendorName
                          ? `Suggested supplier ${recommendation.vendorName}`
                          : "Supplier can be selected in PO form"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate("/inventory/purchase-order", {
                          state: { mrpRecommendation: recommendation },
                        })
                      }
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Create PO
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
            Building material plan...
          </div>
        )}

        {!loading && filteredProjects.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
            No project material plans match the current filters.
          </div>
        )}

        {!loading &&
          filteredProjects.map((project) => {
            const meta = statusMeta[project.status] || statusMeta.ok;

            return (
              <article
                key={project.projectId}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-900">
                        {project.projectName}
                      </h2>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.pillClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Deadline {formatDate(project.deadline)} | Required{" "}
                      {formatQuantity(project.totalRequired)} units | Available{" "}
                      {formatQuantity(project.totalAvailable)} units
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Materials
                      </p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">
                        {project.materials.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Shortage
                      </p>
                      <p className="mt-1 text-xl font-semibold text-red-600">
                        {formatQuantity(project.totalShortage)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Value
                      </p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">
                        {formatCurrency(
                          project.materials.reduce(
                            (sum, material) =>
                              sum + Number(material.recommendedOrder || 0) * Number(material.price || 0),
                            0
                          )
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold min-w-[220px]">
                          Material
                        </th>
                        <th className="px-4 py-3 text-right font-semibold min-w-[120px]">
                          Required
                        </th>
                        <th className="px-4 py-3 text-right font-semibold min-w-[120px]">
                          Available
                        </th>
                        <th className="px-4 py-3 text-right font-semibold min-w-[120px]">
                          Shortage
                        </th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[120px]">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right font-semibold min-w-[150px]">
                          Recommended PO
                        </th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[170px]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.materials.map((material) => {
                        const rowMeta =
                          statusMeta[material.status] || statusMeta.ok;
                        const recommendation =
                          recommendationLookup[
                            `${project.projectId}::${material.materialKey}`
                          ] || null;

                        return (
                          <tr
                            key={material.id}
                            className="border-t border-slate-100 align-top"
                          >
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">
                                {material.productName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Planned {formatQuantity(material.plannedQuantity)} |
                                Consumed {formatQuantity(material.consumedQuantity)} |
                                Available now {formatQuantity(material.availableNow)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {formatQuantity(material.required)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              <div>{formatQuantity(material.available)}</div>
                              <div className="text-xs text-slate-500">
                                +{formatQuantity(material.incomingBeforeDeadline)} incoming
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">
                              {formatQuantity(material.shortage)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${rowMeta.pillClass}`}
                              >
                                {rowMeta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">
                              {formatQuantity(material.recommendedOrder)}
                            </td>
                            <td className="px-4 py-3">
                              {recommendation ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate("/inventory/purchase-order", {
                                      state: { mrpRecommendation: recommendation },
                                    })
                                  }
                                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                                >
                                  Create Purchase Order
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  No procurement action required
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
      </section>
    </div>
  );
};

export default MaterialPlanning;
