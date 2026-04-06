import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchBoqs } from "../../services/boqApi";
import {
  createConsumption,
  deleteConsumption,
  fetchConsumptions,
  updateConsumption,
} from "../../services/consumptionApi";
import { fetchLocations } from "../../services/locationsApi";
import { fetchProjects } from "../../services/projectsApi";
import { getProjects as getCachedProjects } from "../../services/projectsStore";
import useSettings from "../../hooks/useSettings";
import DateInput from "../common/DateInput";
import DocumentViewPanel from "./DocumentViewPanel";
import { formatDate } from "../../utils/dateFormat";
import { printSection } from "../../utils/printUtils";
import { resolveBrandLogo } from "../../utils/branding";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "../../services/projectSelectionStore";

const panel =
  "rounded-xl border border-slate-200 bg-[#f8f9ff] shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const issuedByOptions = [
  "Store Keeper",
  "Site Engineer",
  "Supervisor",
  "Project Manager",
];
const statusOptions = ["Logged", "Reviewed", "Approved"];

const rowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const qty = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtQty = (v) =>
  (Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const keyOf = (it = {}) =>
  `${String(it.name || "")
    .trim()
    .toLowerCase()}::${String(it.unit || "PCS")
    .trim()
    .toUpperCase()}`;
const lineItem = (o = {}) => ({
  id: o.id ?? rowId(),
  boqItemId: o.boqItemId ?? null,
  name: o.name ?? "",
  unit: o.unit ?? "PCS",
  hsn: o.hsn ?? "",
  gst: o.gst ?? "",
  receivedQty: qty(o.receivedQty ?? 0),
  quantity: o.quantity === "" ? "" : o.quantity ?? "",
  notes: o.notes ?? "",
});
const formState = (consumptionNumber = "", companyDefaults = {}) => ({
  consumptionNumber,
  projectId: "",
  locationId: "",
  consumptionDate: new Date().toISOString().slice(0, 10),
  issuedBy: "Store Keeper",
  status: "Logged",
  notes: "",
  companyAddress: companyDefaults.address ?? "",
  companyGstin: companyDefaults.gstin ?? "",
  companyPhone: companyDefaults.phone ?? "",
  companyEmail: companyDefaults.email ?? "",
});
const err = (e, fallback) => e?.response?.data?.error || e?.message || fallback;
const sortValue = (r = {}) => {
  const raw = r.updatedAt ?? r.consumptionDate ?? r.date ?? r.createdAt ?? null;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};
const ver = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const pickBoq = (projectId, boqs = []) => {
  if (!projectId) return null;
  const rank = { Approved: 3, Draft: 2, Closed: 1 };
  const list = boqs.filter((b) => String(b.projectId) === String(projectId));
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const s = (rank[b.status] ?? 0) - (rank[a.status] ?? 0);
    if (s !== 0) return s;
    const v = ver(b.version) - ver(a.version);
    if (v !== 0) return v;
    return sortValue(b) - sortValue(a);
  })[0];
};
const boqItems = (projectId, boqs = []) => {
  const boq = pickBoq(projectId, boqs);
  const mapped = (boq?.items || []).map((it) =>
    lineItem({
      boqItemId: it.id ?? it.LineItemId ?? keyOf(it),
      name: it.name ?? "",
      unit: it.unit ?? "PCS",
      hsn: it.hsn ?? "",
      gst: it.gst ?? "",
      receivedQty: Number.isFinite(Number(it.availableQty))
        ? qty(it.availableQty)
        : qty(it.quantity),
      quantity: "",
      notes: it.notes ?? "",
    })
  );
  return mapped.length ? mapped : [lineItem()];
};
const mergeEdit = (projectId, boqs = [], saved = []) => {
  const boq = pickBoq(projectId, boqs);
  if (!boq) {
    return saved.length
      ? saved.map((it) =>
          lineItem({
            id: it.id ?? rowId(),
            boqItemId: it.boqItemId ?? it.id ?? null,
            name: it.name ?? "",
            unit: it.unit ?? "PCS",
            hsn: it.hsn ?? "",
            gst: it.gst ?? "",
            receivedQty: Math.max(qty(it.receivedQty), qty(it.quantity)),
            quantity: it.quantity ?? "",
            notes: it.notes ?? "",
          })
        )
      : [lineItem()];
  }
  const byKey = new Map();
  saved.forEach((it) => {
    const k = keyOf(it);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  });
  const mapped = (boq.items || []).map((bi) => {
    const k = keyOf(bi);
    const m = byKey.get(k) || [];
    const found = m.shift() ?? null;
    if (!m.length) byKey.delete(k);
    const hasAvailable = Number.isFinite(Number(bi.availableQty));
    const baseAvailable = hasAvailable ? qty(bi.availableQty) : qty(bi.quantity);
    const receivedQty = hasAvailable ? baseAvailable + qty(found?.quantity) : baseAvailable;
    return lineItem({
      id: found?.id ?? rowId(),
      boqItemId: bi.id ?? bi.LineItemId ?? k,
      name: bi.name ?? "",
      unit: bi.unit ?? "PCS",
      hsn: found?.hsn ?? bi.hsn ?? "",
      gst: found?.gst ?? bi.gst ?? "",
      receivedQty,
      quantity: found?.quantity ?? "",
      notes: found?.notes ?? bi.notes ?? "",
    });
  });
  const extra = Array.from(byKey.values())
    .flat()
    .map((it) =>
      lineItem({
        id: it.id ?? rowId(),
        boqItemId: it.boqItemId ?? it.id ?? null,
        name: it.name ?? "",
        unit: it.unit ?? "PCS",
        hsn: it.hsn ?? "",
        gst: it.gst ?? "",
        receivedQty: Math.max(qty(it.receivedQty), qty(it.quantity)),
        quantity: it.quantity ?? "",
        notes: it.notes ?? "",
      })
    );
  return [...mapped, ...extra].length ? [...mapped, ...extra] : [lineItem()];
};
const nextConNo = (records = []) => {
  const y = new Date().getFullYear();
  const pref = `CON-${y}-`;
  const re = new RegExp(`^CON-${y}-(\\d+)$`, "i");
  let max = 0;
  const used = new Set();
  records.forEach((r) => {
    const n = String(r?.consumptionNumber || "").trim();
    if (!n) return;
    used.add(n.toUpperCase());
    const m = n.match(re);
    if (!m) return;
    max = Math.max(max, Number.parseInt(m[1], 10) || 0);
  });
  let seq = max + 1;
  let cand = `${pref}${String(seq).padStart(3, "0")}`;
  while (used.has(cand.toUpperCase())) {
    seq += 1;
    cand = `${pref}${String(seq).padStart(3, "0")}`;
  }
  return cand;
};
const byProject = (projectId, locations = []) =>
  !projectId
    ? locations
    : locations.filter(
        (l) => !l.projectId || String(l.projectId) === String(projectId)
      );

const Consumption = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const company = settings?.company || {};
  const logoUrl = resolveBrandLogo(company.logo || settings?.profile?.avatar || "");
  const brandName = company.name || "Bangalore Electronics";
  const brandDescription = company.address || "Company address";
  const companyDefaults = {
    address: company.address ?? "",
    gstin: company.gstin ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
  };

  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(() => formState("", companyDefaults));
  const [items, setItems] = useState([lineItem()]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [refreshingLocations, setRefreshingLocations] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewRecord, setViewRecord] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => sortValue(b) - sortValue(a)),
    [records]
  );
  const boqItemMap = useMemo(() => {
    const map = new Map();
    (boqs || []).forEach((boq) => {
      (boq.items || []).forEach((item) => {
        const key = item.id ?? item.LineItemId ?? item.boqItemId ?? null;
        if (key !== null && key !== undefined) {
          map.set(String(key), item);
        }
      });
    });
    return map;
  }, [boqs]);
  const projectMap = useMemo(
    () =>
      projects.reduce((acc, p) => {
        acc[String(p.id)] = p;
        return acc;
      }, {}),
    [projects]
  );
  const locationMap = useMemo(
    () =>
      locations.reduce((acc, l) => {
        acc[String(l.id)] = l;
        return acc;
      }, {}),
    [locations]
  );
  const filteredLocations = useMemo(
    () => byProject(form.projectId, locations),
    [form.projectId, locations]
  );
  const selectedBoq = useMemo(() => pickBoq(form.projectId, boqs), [form.projectId, boqs]);
  const totalQty = useMemo(
    () =>
      sortedRecords.reduce(
        (sum, r) => sum + (r.items || []).reduce((s, it) => s + qty(it.quantity), 0),
        0
      ),
    [sortedRecords]
  );
  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedRecords.filter((r) => {
      if (statusFilter !== "all" && String(r.status || "").toLowerCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const t = [
        r.consumptionNumber,
        projectMap[String(r.projectId)]?.name,
        locationMap[String(r.locationId)]?.name,
        r.status,
        r.issuedBy,
        r.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return t.includes(q);
    });
  }, [query, statusFilter, sortedRecords, projectMap, locationMap]);

  const loadRecords = async () => {
    const list = await fetchConsumptions();
    const safe = Array.isArray(list) ? list : [];
    const sorted = [...safe].sort((a, b) => sortValue(b) - sortValue(a));
    setRecords(sorted);
    return sorted;
  };

  const loadBoqs = async () => {
    const list = await fetchBoqs();
    const safe = Array.isArray(list) ? list : [];
    setBoqs(safe);
    return safe;
  };

  const reset = (latest = sortedRecords) => {
    setForm(formState(nextConNo(latest), companyDefaults));
    setItems([lineItem()]);
    setErrors({});
    setEditingId(null);
  };

  const clearErr = (f) =>
    setErrors((p) => {
      if (!p[f]) return p;
      const n = { ...p };
      delete n[f];
      return n;
    });

  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      setLoading(true);
      setErrorMessage("");
      const [pr, lr, br, rr] = await Promise.allSettled([
        fetchProjects(),
        fetchLocations(),
        fetchBoqs(),
        fetchConsumptions(),
      ]);
      if (!mounted) return;
      const fallbackProjects = getCachedProjects();
      const p =
        pr.status === "fulfilled" && Array.isArray(pr.value)
          ? pr.value
          : Array.isArray(fallbackProjects)
          ? fallbackProjects
          : [];
      const l = lr.status === "fulfilled" && Array.isArray(lr.value) ? lr.value : [];
      const b = br.status === "fulfilled" && Array.isArray(br.value) ? br.value : [];
      const r = rr.status === "fulfilled" && Array.isArray(rr.value) ? rr.value : [];
      const rs = [...r].sort((a, b2) => sortValue(b2) - sortValue(a));
      setProjects(p);
      setLocations(l);
      setBoqs(b);
      setRecords(rs);
      setForm((prev) =>
        prev.consumptionNumber ? prev : formState(nextConNo(rs), companyDefaults)
      );
      const e =
        (pr.status === "rejected" && !p.length ? err(pr.reason, "Failed to load projects.") : "") ||
        (lr.status === "rejected" ? err(lr.reason, "Failed to load locations.") : "") ||
        (br.status === "rejected" ? err(br.reason, "Failed to load BOQs.") : "") ||
        (rr.status === "rejected" ? err(rr.reason, "Failed to load consumption records.") : "");
      if (e) setErrorMessage(e);
      setLoading(false);
    };
    const refreshOnEvent = () => {
      void (async () => {
        try {
          await Promise.all([loadRecords(), loadBoqs()]);
        } catch (e) {
          setErrorMessage(err(e, "Failed to refresh records."));
        }
      })();
    };
    void loadAll();
    if (typeof window !== "undefined") {
      window.addEventListener("consumptions:changed", refreshOnEvent);
    }
    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("consumptions:changed", refreshOnEvent);
      }
    };
  }, []);

  useEffect(() => {
    if (!form.locationId) return;
    const ok = filteredLocations.some((l) => String(l.id) === String(form.locationId));
    if (!ok) setForm((p) => ({ ...p, locationId: "" }));
  }, [filteredLocations, form.locationId]);

  useEffect(() => {
    if (!viewRecord?.id) return;
    const updated = records.find((r) => String(r.id) === String(viewRecord.id));
    if (updated && updated !== viewRecord) {
      setViewRecord(updated);
    }
  }, [records, viewRecord?.id]);

  useEffect(() => {
    if (editingId || form.projectId || !projects.length || !boqs.length) {
      return;
    }
    const activeProjectId = getActiveProjectId();
    if (!activeProjectId) {
      return;
    }
    const exists = projects.some(
      (project) => String(project.id) === String(activeProjectId)
    );
    if (!exists) {
      return;
    }
    onProjectChange(String(activeProjectId));
  }, [boqs.length, editingId, form.projectId, projects]);

  const onProjectChange = (projectId) => {
    setForm((p) => ({
      ...p,
      projectId,
      locationId: byProject(projectId, locations).some((l) => String(l.id) === String(p.locationId))
        ? p.locationId
        : "",
    }));
    setItems(boqItems(projectId, boqs));
    clearErr("projectId");
    clearErr("locationId");
    clearErr("items");
    if (projectId) {
      setActiveProjectId(projectId);
    }
  };

  const onItemChange = (id, fieldName, value) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (fieldName === "quantity") {
          const r = qty(it.receivedQty);
          const q = value === "" ? "" : Math.max(qty(value), 0);
          return { ...it, quantity: q === "" ? "" : r > 0 ? Math.min(q, r) : q };
        }
        return { ...it, [fieldName]: value };
      })
    );
    clearErr("items");
  };

  const addItem = () => setItems((prev) => [...prev, lineItem()]);
  const removeItem = (id) =>
    setItems((prev) => {
      const n = prev.filter((it) => it.id !== id);
      return n.length ? n : [lineItem()];
    });

  const validate = () => {
    const next = {};
    if (!String(form.consumptionNumber || "").trim()) next.consumptionNumber = "Consumption reference is required.";
    if (!form.projectId) next.projectId = "Select a project.";
    if (!form.locationId) next.locationId = "Select a location.";
    const valid = items.filter((it) => String(it.name || "").trim() && qty(it.quantity) > 0);
    if (!valid.length) next.items = "Add at least one material with consumed quantity.";
    const over = items.find((it) => String(it.name || "").trim() && qty(it.receivedQty) > 0 && qty(it.quantity) > qty(it.receivedQty));
    if (over) next.items = "Consumed qty cannot exceed received qty.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      consumptionNumber: String(form.consumptionNumber || "").trim(),
      projectId: Number(form.projectId) || form.projectId,
      locationId: Number(form.locationId) || form.locationId,
      consumptionDate: form.consumptionDate,
      issuedBy: form.issuedBy,
      status: form.status,
      notes: form.notes,
      companyAddress: form.companyAddress,
      companyGstin: form.companyGstin,
      companyPhone: form.companyPhone,
      companyEmail: form.companyEmail,
      items: items
        .map((it) => ({
          boqItemId: it.boqItemId ?? null,
          name: String(it.name || "").trim(),
          description: null,
          unit: String(it.unit || "PCS").trim() || "PCS",
          hsn: String(it.hsn || "").trim(),
          gst: String(it.gst || "").trim(),
          quantity: qty(it.quantity),
          rate: 0,
          notes: String(it.notes || "").trim() || null,
        }))
        .filter((it) => it.name && it.quantity > 0),
    };
    try {
      setSaving(true);
      setErrorMessage("");
      if (editingId) await updateConsumption(editingId, payload);
      else await createConsumption(payload);
      const latest = await loadRecords();
      try {
        await loadBoqs();
      } catch (boqErr) {
        setErrorMessage(err(boqErr, "Saved, but failed to refresh BOQ data."));
      }
      reset(latest);
    } catch (x) {
      setErrorMessage(err(x, "Failed to save consumption entry."));
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (r) => {
    setEditingId(r.id);
    setErrors({});
    setErrorMessage("");
    setForm({
      consumptionNumber: r.consumptionNumber || "",
      projectId: r.projectId ? String(r.projectId) : "",
      locationId: r.locationId ? String(r.locationId) : "",
      consumptionDate: r.consumptionDate || new Date().toISOString().slice(0, 10),
      issuedBy: r.issuedBy || "Store Keeper",
      status: statusOptions.includes(r.status) ? r.status : "Logged",
      notes: r.notes || "",
      companyAddress: r.companyAddress || companyDefaults.address || "",
      companyGstin: r.companyGstin || companyDefaults.gstin || "",
      companyPhone: r.companyPhone || companyDefaults.phone || "",
      companyEmail: r.companyEmail || companyDefaults.email || "",
    });
    setItems(mergeEdit(r.projectId, boqs, r.items || []));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (r) => {
    if (!r?.id) return;
    if (!window.confirm(`Delete ${r.consumptionNumber || "this entry"}?`)) return;
    try {
      await deleteConsumption(r.id);
      const latest = await loadRecords();
      if (editingId === r.id) reset(latest);
      if (viewRecord?.id === r.id) setViewRecord(null);
    } catch (x) {
      setErrorMessage(err(x, "Failed to delete consumption entry."));
    }
  };

  const refreshLocations = async () => {
    try {
      setRefreshingLocations(true);
      const list = await fetchLocations();
      const safe = Array.isArray(list) ? list : [];
      setLocations(safe);
      setForm((p) => ({
        ...p,
        locationId: byProject(p.projectId, safe).some((l) => String(l.id) === String(p.locationId))
          ? p.locationId
          : "",
      }));
    } catch (x) {
      setErrorMessage(err(x, "Failed to refresh locations."));
    } finally {
      setRefreshingLocations(false);
    }
  };

  const printRecord = (r) => {
    setViewRecord(r);
    setTimeout(() => {
      printSection({
        selector: "#consumption-view-panel",
        title: "Consumption Details",
        logoUrl,
        brandName,
        brandDescription,
      });
    }, 80);
  };

  const statusClass = (s) => {
    const n = String(s || "").toLowerCase();
    if (n === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (n === "reviewed") return "border-blue-200 bg-blue-50 text-blue-700";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-blue-600 text-sm font-semibold text-white">
            ≡
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-800">
            Consumption
          </h1>
        </div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
          PROJECTS / Consumption
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <article className={panel}>
          <div className="p-4">
            <p className="text-sm text-slate-500">Total Entries</p>
            <p className="mt-1 text-4xl font-semibold text-slate-800">
              {sortedRecords.length}
            </p>
          </div>
        </article>
        <article className={panel}>
          <div className="p-4">
            <p className="text-sm text-slate-500">Qty Consumed</p>
            <p className="mt-1 text-4xl font-semibold text-slate-800">
              {fmtQty(totalQty)}
            </p>
          </div>
        </article>
        <div className={`${panel} flex items-center justify-end p-4`}>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            Clear Form
          </button>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="text-3xl font-semibold text-slate-800">
              Consumption Details
            </h2>
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Add Consumption
            </button>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label>
                <span className="text-sm font-semibold text-slate-700">
                  Consumption Ref#
                </span>
                <input
                  className={field}
                  value={form.consumptionNumber}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, consumptionNumber: e.target.value }));
                    clearErr("consumptionNumber");
                  }}
                />
                {errors.consumptionNumber && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.consumptionNumber}
                  </p>
                )}
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">
                  Project <span className="text-blue-600">*</span>
                </span>
                <select
                  className={field}
                  value={form.projectId}
                  onChange={(e) => onProjectChange(e.target.value)}
                >
                  <option value="">
                    {loading
                      ? "Loading projects..."
                      : projects.length
                      ? "Select project"
                      : "No projects"}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {errors.projectId && (
                  <p className="mt-1 text-xs text-red-600">{errors.projectId}</p>
                )}
              </label>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Location <span className="text-blue-600">*</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={refreshLocations}
                      disabled={refreshingLocations}
                      className="text-xs text-slate-600 underline"
                    >
                      {refreshingLocations ? "Refreshing..." : "Refresh"}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/inventory/locations")}
                      className="text-xs text-blue-600 underline"
                    >
                      Manage
                    </button>
                  </div>
                </div>
                <select
                  className={field}
                  value={form.locationId}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, locationId: e.target.value }));
                    clearErr("locationId");
                  }}
                >
                  <option value="">
                    {filteredLocations.length
                      ? "Select location"
                      : "No location for selected project"}
                  </option>
                  {filteredLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {errors.locationId && (
                  <p className="mt-1 text-xs text-red-600">{errors.locationId}</p>
                )}
              </div>

              <label>
                <span className="text-sm font-semibold text-slate-700">
                  Consumption Date
                </span>
                <DateInput
                  className={field}
                  value={form.consumptionDate}
                  onChange={(v) => setForm((p) => ({ ...p, consumptionDate: v }))}
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">
                  Issued By
                </span>
                <select
                  className={field}
                  value={form.issuedBy}
                  onChange={(e) => setForm((p) => ({ ...p, issuedBy: e.target.value }))}
                >
                  {issuedByOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">Status</span>
                <select
                  className={field}
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  {statusOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span className="text-sm font-semibold text-slate-700">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Usage notes or approvals."
                className="mt-1 min-h-[84px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Company Address
                </span>
                <textarea
                  value={form.companyAddress}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, companyAddress: e.target.value }))
                  }
                  placeholder="Company address"
                  className="mt-1 min-h-[70px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">GST No</span>
                <input
                  className={field}
                  value={form.companyGstin}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, companyGstin: e.target.value }))
                  }
                  placeholder="GST No"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">Phone</span>
                <input
                  className={field}
                  value={form.companyPhone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, companyPhone: e.target.value }))
                  }
                  placeholder="Phone"
                />
              </label>

              <label className="md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Email</span>
                <input
                  className={field}
                  value={form.companyEmail}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, companyEmail: e.target.value }))
                  }
                  placeholder="Email"
                />
              </label>
            </div>

            {form.projectId && selectedBoq && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                BOQ Auto-fill:{" "}
                <span className="font-semibold">
                  {selectedBoq.boqNumber || "N/A"}
                </span>
                {" | "}Version {selectedBoq.version || "-"}
                {" | "}{(selectedBoq.items || []).length} items loaded
              </div>
            )}
            {form.projectId && !selectedBoq && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No BOQ found for this project. You can add items manually.
              </div>
            )}
          </div>
        </section>

        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="text-3xl font-semibold text-slate-800">
              Materials Consumed
            </h2>
            <button
              type="button"
              onClick={addItem}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Add Item
            </button>
          </div>

          <div className="overflow-x-auto px-2 pb-1 pt-2">
            <table className="min-w-full text-sm">
              <thead className="bg-[#eceff8] text-slate-700">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold min-w-[220px]">Material</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[110px]">HSN</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[110px]">GST</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[100px]">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[130px]">Received Qty</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[130px]">Consumed Qty</th>
                  <th className="px-3 py-3 text-right font-semibold min-w-[130px]">Balance Qty</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[170px]">Notes</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[110px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const bal = Math.max(qty(it.receivedQty) - qty(it.quantity), 0);
                  return (
                    <tr key={it.id} className="border-b border-slate-200 bg-white">
                      <td className="px-3 py-2"><input value={it.name} onChange={(e) => onItemChange(it.id, "name", e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></td>
                      <td className="px-3 py-2"><input value={it.hsn} onChange={(e) => onItemChange(it.id, "hsn", e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></td>
                      <td className="px-3 py-2"><input value={it.gst} onChange={(e) => onItemChange(it.id, "gst", e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></td>
                      <td className="px-3 py-2"><input value={it.unit} onChange={(e) => onItemChange(it.id, "unit", e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></td>
                      <td className="px-3 py-2"><input readOnly value={fmtQty(it.receivedQty)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2 text-right text-sm font-medium text-slate-700" /></td>
                      <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={it.quantity} onChange={(e) => onItemChange(it.id, "quantity", e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-right text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></td>
                      <td className="px-3 py-2"><input readOnly value={fmtQty(bal)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2 text-right text-sm font-medium text-slate-700" /></td>
                      <td className="px-3 py-2"><input value={it.notes} onChange={(e) => onItemChange(it.id, "notes", e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></td>
                      <td className="px-3 py-2"><button type="button" onClick={() => removeItem(it.id)} className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.items && <p className="px-4 pb-2 text-xs text-red-600">{errors.items}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">
              Showing 1 to {items.length} of ({items.length}) entries | BOQ Qty:{" "}
              {fmtQty(items.reduce((s, i) => s + qty(i.receivedQty), 0))} |
              Consumed: {fmtQty(items.reduce((s, i) => s + qty(i.quantity), 0))}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => reset()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? (editingId ? "Updating..." : "Saving...") : "Save Entry"}
              </button>
            </div>
          </div>
        </section>
      </form>

      <section id="consumption-register" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-3xl font-semibold text-slate-800">Consumption Register</h2>
          <button type="button" onClick={() => printSection({ selector: "#consumption-register", title: "Consumption Register", subtitle: "Material consumption ledger", metaRows: [{ label: "Total Entries", value: sortedRecords.length }, { label: "Qty Consumed", value: fmtQty(totalQty) }] })} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Post register</button>
        </div>
        <div className="grid gap-2 border-b border-slate-200 px-4 py-3 md:grid-cols-[1fr_210px]">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ref, project, location, status..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="all">All Status</option><option value="logged">Logged</option><option value="reviewed">Reviewed</option><option value="approved">Approved</option></select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#eceff8] text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-semibold min-w-[130px]">Ref</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Project</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Location</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Date</th>
                <th className="px-4 py-3 text-right font-semibold min-w-[120px]">Qty Consumed</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[120px]">Status</th>
                <th className="px-4 py-3 text-left font-semibold min-w-[220px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-10 text-center text-slate-500">
                    {loading ? "Loading consumption records..." : "No consumption records found."}
                  </td>
                </tr>
              )}
              {visibleRecords.map((r) => {
                const q = (r.items || []).reduce((s, i) => s + qty(i.quantity), 0);
                return (
                  <tr key={r.id} className="border-b border-slate-200 bg-white">
                    <td className="px-4 py-3 text-slate-800">{r.consumptionNumber || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{projectMap[String(r.projectId)]?.name || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{locationMap[String(r.locationId)]?.name || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.consumptionDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtQty(q)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(r.status)}`}>{r.status || "Logged"}</span></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-3 text-sm"><button type="button" onClick={() => setViewRecord(r)} className="text-blue-700 underline">View</button><button type="button" onClick={() => printRecord(r)} className="text-slate-700 underline">Print</button><button type="button" onClick={() => onEdit(r)} className="text-blue-700 underline">Edit</button><button type="button" onClick={() => { void onDelete(r); }} className="text-red-600 underline">Delete</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {viewRecord && (
        <DocumentViewPanel
          id="consumption-view-panel"
          title="CONSUMPTION DETAILS"
          onClose={() => setViewRecord(null)}
          companyName={brandName}
          companyAddress={viewRecord.companyAddress || brandDescription}
          companyGstin={viewRecord.companyGstin || company.gstin}
          companyPhone={viewRecord.companyPhone || company.phone}
          companyEmail={viewRecord.companyEmail || company.email}
          logoUrl={logoUrl}
          primaryPairs={[
            { label: "Reference", value: viewRecord.consumptionNumber },
            { label: "Date", value: formatDate(viewRecord.consumptionDate || viewRecord.createdAt) },
            { label: "Status", value: viewRecord.status || "Logged" },
            { label: "Issued By", value: viewRecord.issuedBy || "-" },
          ]}
          leftBlockTitle="Project"
          leftBlockLines={[projectMap[String(viewRecord.projectId)]?.name || "-"]}
          rightBlockTitle="Location"
          rightBlockLines={[locationMap[String(viewRecord.locationId)]?.name || "-", viewRecord.notes || "-"]}
          tableColumns={[
            { key: "serial", label: "Sl No", widthClass: "w-16" },
            { key: "name", label: "Material" },
            { key: "hsn", label: "HSN", widthClass: "w-20" },
            { key: "gst", label: "GST", widthClass: "w-20" },
            { key: "unit", label: "Unit", widthClass: "w-20" },
            { key: "boqQty", label: "BOQ Qty", align: "right", widthClass: "w-24" },
            { key: "boqConsumed", label: "Total Consumed", align: "right", widthClass: "w-28" },
            { key: "boqAvailable", label: "Balance", align: "right", widthClass: "w-24" },
          ]}
          tableRows={(viewRecord.items || []).map((it, idx) => {
            const boqItemId = it.boqItemId ?? null;
            const boqItem = boqItemId ? boqItemMap.get(String(boqItemId)) : null;
            const rawBoqQty = Number(boqItem?.quantity);
            const rawAvailable = Number(boqItem?.availableQty);
            const rawConsumed = Number(boqItem?.consumedQty);
            const resolvedAvailable = Number.isFinite(rawAvailable)
              ? rawAvailable
              : Number.isFinite(rawBoqQty) && Number.isFinite(rawConsumed)
              ? Math.max(rawBoqQty - rawConsumed, 0)
              : NaN;
            const resolvedConsumed = Number.isFinite(rawConsumed)
              ? rawConsumed
              : Number.isFinite(rawBoqQty) && Number.isFinite(rawAvailable)
              ? Math.max(rawBoqQty - rawAvailable, 0)
              : NaN;

            return {
              id: it.id || idx,
              serial: idx + 1,
              name: it.name || "-",
              hsn: it.hsn || "-",
              gst: it.gst || "-",
              unit: it.unit || "PCS",
              boqQty: Number.isFinite(rawBoqQty) ? fmtQty(rawBoqQty) : "-",
              boqConsumed: Number.isFinite(resolvedConsumed) ? fmtQty(resolvedConsumed) : "-",
              boqAvailable: Number.isFinite(resolvedAvailable) ? fmtQty(resolvedAvailable) : "-",
            };
          })}
          bottomLeftTitle="Total Items"
          bottomLeftValue={(viewRecord.items || []).length}
          footerCompanyName={brandName || "Company"}
        />
      )}
    </div>
  );
};

export default Consumption;
