import { useCallback, useEffect, useState } from "react";
import { fetchBoqs } from "../services/boqApi";
import { fetchConsumptions } from "../services/consumptionApi";
import { fetchItems } from "../services/inventoryApi";
import { fetchProjects } from "../services/projectsApi";
import { fetchPurchaseOrders } from "../services/purchaseOrdersApi";
import { buildMrpSnapshot } from "../services/mrpEngine";
import { getProjects as getCachedProjects } from "../services/projectsStore";
import { getSettings } from "../services/settingsStore";
import { fetchVendors } from "../services/vendorsApi";

const refreshEvents = [
  "projects:changed",
  "products:changed",
  "purchase-orders:changed",
  "boqs:changed",
  "consumptions:changed",
  "settings:changed",
];

const joinErrors = (errors = []) =>
  errors
    .map((error) => error?.response?.data?.error || error?.message || "")
    .filter(Boolean)
    .join(" ");

export const useMrpPlanning = () => {
  const [snapshot, setSnapshot] = useState(() =>
    buildMrpSnapshot({
      projects: getCachedProjects(),
      settings: getSettings(),
    })
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    const results = await Promise.allSettled([
      fetchProjects(),
      fetchBoqs(),
      fetchItems(),
      fetchPurchaseOrders(),
      fetchConsumptions(),
      fetchVendors(),
    ]);

    const projects =
      results[0].status === "fulfilled" && Array.isArray(results[0].value)
        ? results[0].value
        : getCachedProjects();
    const boqs =
      results[1].status === "fulfilled" && Array.isArray(results[1].value)
        ? results[1].value
        : [];
    const items =
      results[2].status === "fulfilled" && Array.isArray(results[2].value)
        ? results[2].value
        : [];
    const purchaseOrders =
      results[3].status === "fulfilled" && Array.isArray(results[3].value)
        ? results[3].value
        : [];
    const consumptions =
      results[4].status === "fulfilled" && Array.isArray(results[4].value)
        ? results[4].value
        : [];
    const vendors =
      results[5].status === "fulfilled" && Array.isArray(results[5].value)
        ? results[5].value
        : [];

    const nextSnapshot = buildMrpSnapshot({
      projects,
      boqs,
      items,
      purchaseOrders,
      consumptions,
      vendors,
      settings: getSettings(),
      now: new Date(),
    });

    setSnapshot(nextSnapshot);

    const nextError = joinErrors(
      results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason)
    );
    setError(nextError);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void reload();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [reload]);

  useEffect(() => {
    const handleReload = () => {
      void reload({ silent: true });
    };

    refreshEvents.forEach((eventName) =>
      window.addEventListener(eventName, handleReload)
    );

    return () => {
      refreshEvents.forEach((eventName) =>
        window.removeEventListener(eventName, handleReload)
      );
    };
  }, [reload]);

  return {
    snapshot,
    loading,
    error,
    reload,
  };
};

export default useMrpPlanning;
