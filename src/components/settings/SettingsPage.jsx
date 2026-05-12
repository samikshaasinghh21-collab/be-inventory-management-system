import { useEffect, useRef, useState } from "react";
import {
  getSettings,
  resetSettings,
  saveSettings,
} from "../../services/settingsStore";

const SECTION_LINKS = [
  {
    id: "profile",
    label: "Profile & Access",
    description: "User details and role",
  },
  {
    id: "company",
    label: "Organization",
    description: "Business profile",
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Locale and display options",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Defaults and stock rules",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Alerts and summaries",
  },
  {
    id: "security",
    label: "Security",
    description: "Access policies",
  },
];

const inputClass =
  "w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none";
const textareaClass = `${inputClass} min-h-[120px]`;
const sectionClass =
  "border border-slate-200 rounded-xl p-5 bg-white shadow-sm scroll-mt-24";

const normalizeSettingsForm = (settings = {}) => ({
  ...settings,
  preferences: {
    ...(settings.preferences || {}),
    currency: "INR",
  },
});

const ToggleItem = ({ checked, onChange, title, description }) => (
  <label className="flex items-start gap-3 text-sm text-slate-600">
    <input
      type="checkbox"
      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      checked={checked}
      onChange={onChange}
    />
    <span>
      <span className="font-medium text-slate-800">{title}</span>
      <span className="block text-xs text-slate-500">{description}</span>
    </span>
  </label>
);

const SettingsPage = () => {
  const [form, setForm] = useState(() => normalizeSettingsForm(getSettings()));
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(normalizeSettingsForm(getSettings()))
  );
  const [status, setStatus] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isDirty = JSON.stringify(form) !== baseline;

  const updateSection = (section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const showStatus = (type, message) => {
    setStatus({ type, message });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setStatus(null), 2200);
  };

  const handleSave = () => {
    if (!isDirty) {
      return;
    }
    const normalized = normalizeSettingsForm(form);
    saveSettings(normalized);
    setForm(normalized);
    setBaseline(JSON.stringify(normalized));
    showStatus("success", "Settings saved.");
  };

  const handleReset = () => {
    const defaults = resetSettings();
    setForm(defaults);
    setBaseline(JSON.stringify(defaults));
    showStatus("info", "Settings reset to defaults.");
  };

  const handleNumberChange = (section, field, value) => {
    const next = value === "" ? "" : Number(value);
    updateSection(section, field, Number.isNaN(next) ? "" : next);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleSave();
  };

  return (
    <form className="p-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
            Workspace
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage company details, inventory defaults, and notification rules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900 bg-white"
          >
            Reset to Defaults
          </button>
          <button
            type="submit"
            disabled={!isDirty}
            className={`px-5 py-2 rounded-lg text-sm font-medium text-white transition ${
              isDirty
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-indigo-300 cursor-not-allowed"
            }`}
          >
            Save Changes
          </button>
        </div>
      </div>

      {status && (
        <div
          className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6">
        <aside className="bg-white border border-slate-200 rounded-xl p-4 h-fit shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-3">
            Sections
          </p>
          <div className="space-y-2">
            {SECTION_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="block rounded-lg border border-transparent px-3 py-2 text-sm text-slate-600 hover:border-slate-200 hover:bg-slate-50"
              >
                <p className="font-medium text-slate-800">{link.label}</p>
                <p className="text-xs text-slate-500">
                  {link.description}
                </p>
              </a>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
            Demo note: settings are stored in localStorage.
          </div>
        </aside>

        <div className="space-y-6">
          <section id="profile" className={sectionClass}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Profile & Access
                </h2>
                <p className="text-sm text-slate-500">
                  Update your profile details and workspace role.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Account
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  type="text"
                  value={form.profile.fullName}
                  onChange={(event) =>
                    updateSection("profile", "fullName", event.target.value)
                  }
                  placeholder="Ex: Alex Johnson"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  value={form.profile.role}
                  onChange={(event) =>
                    updateSection("profile", "role", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  value={form.profile.email}
                  onChange={(event) =>
                    updateSection("profile", "email", event.target.value)
                  }
                  placeholder="name@company.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.profile.phone}
                  onChange={(event) =>
                    updateSection("profile", "phone", event.target.value)
                  }
                  placeholder="Ex: +1 555 123 4567"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section id="company" className={sectionClass}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Organization
                </h2>
                <p className="text-sm text-slate-500">
                  Core business information used in documents and exports.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Company
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Business Name
                </label>
                <input
                  type="text"
                  value={form.company.name}
                  onChange={(event) =>
                    updateSection("company", "name", event.target.value)
                  }
                  placeholder="Ex: Sunrise Supplies"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  GSTIN / Tax ID
                </label>
                <input
                  type="text"
                  value={form.company.gstin}
                  onChange={(event) =>
                    updateSection("company", "gstin", event.target.value)
                  }
                  placeholder="Ex: 27ABCDE1234F1Z5"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Business Email
                </label>
                <input
                  type="email"
                  value={form.company.email}
                  onChange={(event) =>
                    updateSection("company", "email", event.target.value)
                  }
                  placeholder="accounts@company.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Business Phone
                </label>
                <input
                  type="tel"
                  value={form.company.phone}
                  onChange={(event) =>
                    updateSection("company", "phone", event.target.value)
                  }
                  placeholder="Ex: +1 555 987 6543"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Business State
                </label>
                <input
                  type="text"
                  value={form.company.state}
                  onChange={(event) =>
                    updateSection("company", "state", event.target.value)
                  }
                  placeholder="Ex: Karnataka"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Business City
                </label>
                <input
                  type="text"
                  value={form.company.city}
                  onChange={(event) =>
                    updateSection("company", "city", event.target.value)
                  }
                  placeholder="Ex: Bengaluru"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Business Pincode
                </label>
                <input
                  type="text"
                  value={form.company.pincode}
                  onChange={(event) =>
                    updateSection("company", "pincode", event.target.value)
                  }
                  placeholder="Ex: 560001"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Business Address
                </label>
                <textarea
                  value={form.company.address}
                  onChange={(event) =>
                    updateSection("company", "address", event.target.value)
                  }
                  placeholder="Street, city, state, ZIP"
                  className={textareaClass}
                />
              </div>
            </div>
          </section>

          <section id="preferences" className={sectionClass}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Preferences
                </h2>
                <p className="text-sm text-slate-500">
                  Choose display defaults for currency, dates, and language.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Locale
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Currency
                </label>
                <select
                  value={form.preferences.currency}
                  onChange={(event) =>
                    updateSection("preferences", "currency", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="INR">INR (Indian Rupee)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Date Format
                </label>
                <select
                  value={form.preferences.dateFormat}
                  onChange={(event) =>
                    updateSection("preferences", "dateFormat", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="DD/MM/YY">DD/MM/YY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Time Zone
                </label>
                <select
                  value={form.preferences.timeZone}
                  onChange={(event) =>
                    updateSection("preferences", "timeZone", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Language
                </label>
                <select
                  value={form.preferences.language}
                  onChange={(event) =>
                    updateSection("preferences", "language", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Theme
                </label>
                <select
                  value={form.preferences.theme}
                  onChange={(event) =>
                    updateSection("preferences", "theme", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="Light">Light</option>
                  <option value="Dark">Dark</option>
                  <option value="System">System</option>
                </select>
              </div>
            </div>
          </section>

          <section id="inventory" className={sectionClass}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Inventory Defaults
                </h2>
                <p className="text-sm text-slate-500">
                  Configure item defaults and valuation rules.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Stock
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Default Unit
                </label>
                <select
                  value={form.inventory.defaultUnit}
                  onChange={(event) =>
                    updateSection("inventory", "defaultUnit", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="PCS">PCS</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                  <option value="BOX">BOX</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Reorder Level
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.inventory.reorderLevel}
                  onChange={(event) =>
                    handleNumberChange(
                      "inventory",
                      "reorderLevel",
                      event.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Valuation Method
                </label>
                <select
                  value={form.inventory.valuationMethod}
                  onChange={(event) =>
                    updateSection(
                      "inventory",
                      "valuationMethod",
                      event.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option value="FIFO">FIFO</option>
                  <option value="LIFO">LIFO</option>
                  <option value="Weighted">Weighted</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <ToggleItem
                checked={form.inventory.allowNegativeStock}
                onChange={(event) =>
                  updateSection(
                    "inventory",
                    "allowNegativeStock",
                    event.target.checked
                  )
                }
                title="Allow negative stock"
                description="Permit stock to go below zero on issue."
              />
              <ToggleItem
                checked={form.inventory.autoReorder}
                onChange={(event) =>
                  updateSection(
                    "inventory",
                    "autoReorder",
                    event.target.checked
                  )
                }
                title="Auto-create reorder list"
                description="Draft reorder when items cross the threshold."
              />
              <ToggleItem
                checked={form.inventory.trackBatch}
                onChange={(event) =>
                  updateSection(
                    "inventory",
                    "trackBatch",
                    event.target.checked
                  )
                }
                title="Track batch or serial numbers"
                description="Enable batch/serial capture during receiving."
              />
            </div>
          </section>

          <section id="notifications" className={sectionClass}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Notifications
                </h2>
                <p className="text-sm text-slate-500">
                  Decide when alerts should be sent to your team.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Alerts
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ToggleItem
                checked={form.notifications.email}
                onChange={(event) =>
                  updateSection("notifications", "email", event.target.checked)
                }
                title="Email alerts"
                description="Send alerts to the workspace email."
              />
              <ToggleItem
                checked={form.notifications.sms}
                onChange={(event) =>
                  updateSection("notifications", "sms", event.target.checked)
                }
                title="SMS alerts"
                description="Send SMS notifications for urgent events."
              />
              <ToggleItem
                checked={form.notifications.lowStock}
                onChange={(event) =>
                  updateSection(
                    "notifications",
                    "lowStock",
                    event.target.checked
                  )
                }
                title="Low stock alerts"
                description="Notify when items fall below threshold."
              />
              <ToggleItem
                checked={form.notifications.weeklySummary}
                onChange={(event) =>
                  updateSection(
                    "notifications",
                    "weeklySummary",
                    event.target.checked
                  )
                }
                title="Weekly summary"
                description="Email a weekly inventory recap."
              />
              <ToggleItem
                checked={form.notifications.projectUpdates}
                onChange={(event) =>
                  updateSection(
                    "notifications",
                    "projectUpdates",
                    event.target.checked
                  )
                }
                title="Project allocation updates"
                description="Alert when stock is allocated to projects."
              />
            </div>
          </section>

          <section id="security" className={sectionClass}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Security & Access
                </h2>
                <p className="text-sm text-slate-500">
                  Control authentication policies for the workspace.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Security
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Session Timeout (minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  value={form.security.sessionTimeout}
                  onChange={(event) =>
                    handleNumberChange(
                      "security",
                      "sessionTimeout",
                      event.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Password Expiry (days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.security.passwordExpiryDays}
                  onChange={(event) =>
                    handleNumberChange(
                      "security",
                      "passwordExpiryDays",
                      event.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Closed PO Admin Password
                </label>
                <input
                  type="password"
                  value={form.security.closedPoAdminPassword}
                  onChange={(event) =>
                    updateSection(
                      "security",
                      "closedPoAdminPassword",
                      event.target.value
                    )
                  }
                  placeholder="Required to unlock closed PO edits"
                  className={inputClass}
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Admin users must enter this password before editing a closed purchase order.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <ToggleItem
                checked={form.security.twoFactor}
                onChange={(event) =>
                  updateSection("security", "twoFactor", event.target.checked)
                }
                title="Two-factor authentication"
                description="Require a second factor during sign-in."
              />
              <ToggleItem
                checked={form.security.requireStrongPassword}
                onChange={(event) =>
                  updateSection(
                    "security",
                    "requireStrongPassword",
                    event.target.checked
                  )
                }
                title="Require strong passwords"
                description="Enforce length and complexity rules."
              />
            </div>
          </section>
        </div>
      </div>
    </form>
  );
};

export default SettingsPage;
