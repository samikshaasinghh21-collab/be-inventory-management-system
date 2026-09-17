import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
} from "../services/settingsStore";
import { getCurrentUser } from "../services/authService";
import DateInput from "../components/common/DateInput";
import { PageHeader, Tabs } from "../components/ui";
import "../styles/people.css";

const inputClass =
  "w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none";
const textareaClass = `${inputClass} min-h-[96px]`;
const cardClass = "border border-slate-200 rounded-xl p-5 bg-white shadow-sm";
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

const Profile = () => {
  const [profileTab, setProfileTab] = useState("contact");
  const [settings, setSettings] = useState(() => getSettings());
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(getSettings())
  );
  const [status, setStatus] = useState(null);
  const statusTimer = useRef(null);
  const fileInputRef = useRef(null);

  const profile = {
    ...(settings.profile ?? DEFAULT_SETTINGS.profile),
    role: getCurrentUser()?.role || "User",
  };
  const preferences = settings.preferences ?? DEFAULT_SETTINGS.preferences;

  useEffect(() => {
    const sync = () => {
      const next = getSettings();
      setSettings(next);
      setBaseline(JSON.stringify(next));
    };
    window.addEventListener("settings:changed", sync);
    return () => {
      window.removeEventListener("settings:changed", sync);
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
      }
    };
  }, []);

  const initials = useMemo(() => {
    if (profile.avatar) return "";
    const base = profile.fullName || "My account";
    const letters = base
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
    return letters || "ERP";
  }, [profile.avatar, profile.fullName]);

  const isDirty = JSON.stringify(settings) !== baseline;

  const updateProfile = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      profile: { ...prev.profile, [field]: value },
    }));
  };

  const updatePreferences = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, [field]: value },
    }));
  };

  const handlePhotoSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      showStatus("error", "Only JPG, PNG, or WEBP images are allowed.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      showStatus("error", "Image too large. Max size is 2MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateProfile("avatar", reader.result);
      showStatus("success", "Photo updated.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => updateProfile("avatar", "");

  const showStatus = (type, message) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus({ type, message });
    statusTimer.current = setTimeout(() => setStatus(null), 2200);
  };

  const handleSave = () => {
    saveSettings(settings);
    setBaseline(JSON.stringify(settings));
    showStatus("success", "Profile updated.");
  };

  const handleReset = () => {
    const next = {
      ...settings,
      profile: { ...DEFAULT_SETTINGS.profile },
    };
    setSettings(next);
    saveSettings(next);
    setBaseline(JSON.stringify(next));
    showStatus("info", "Profile reset to defaults.");
  };

  const summaryItem = (label, value) => (
    <div className="flex items-center justify-between py-2 text-sm text-slate-600">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value || "Not set"}</span>
    </div>
  );

  return (
    <div className="people-account">
      <PageHeader eyebrow="My account" title="Profile" description="Your identity, contact details and personal preferences." actions={<><button type="button" className="app-btn app-btn-secondary" onClick={handleReset}>Reset profile</button><button type="button" className="app-btn app-btn-primary" onClick={handleSave} disabled={!isDirty}>Save changes</button></>} />

      {status && (
        <div
          className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            status.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : status.type === "info"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="people-account-grid">
        <div className="space-y-4">
          <div className="people-account-identity">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Workspace
            </p>
            <p className="text-2xl font-semibold mt-2">
              {profile.fullName || "My account"}
            </p>
            <p className="text-sm text-slate-500">
              {profile.email || "Add your contact details"}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              Role · {profile.role || "Admin"}
            </p>
          </div>

          <div className={cardClass}>
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 rounded-full bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center text-lg font-semibold text-slate-700">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  {profile.avatar ? "Change photo" : "Add a photo"}
                </button>
                {profile.avatar && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="block text-sm text-slate-500 hover:text-slate-800"
                  >
                    Remove photo
                  </button>
                )}
                <p className="text-xs text-slate-500">
                  Recommended: square JPG/PNG/WEBP up to 2MB.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              Profile summary
            </h3>
            <div className="divide-y divide-slate-100">
              {summaryItem("Full name", profile.fullName)}
              {summaryItem("Email", profile.email)}
              {summaryItem("Phone", profile.phone)}
              {summaryItem("Role", profile.role)}
              {summaryItem("Country/Region", profile.country)}
              {summaryItem("Languages", profile.languages)}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <Tabs items={[{ id: "contact", label: "Contact & access" }, { id: "personal", label: "Personal details" }]} value={profileTab} onChange={setProfileTab} />
          <section className={cardClass} hidden={profileTab !== "contact"}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Profile & Access
                </h2>
                <p className="text-sm text-slate-500">
                  Update your name, contact methods, and role.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Account
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Full name
                </label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(event) =>
                    updateProfile("fullName", event.target.value)
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
                  value={getCurrentUser()?.role || "User"}
                  disabled
                  className={inputClass}
                >
                  <option value="User">User</option>
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
                  value={profile.email}
                  onChange={(event) =>
                    updateProfile("email", event.target.value)
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
                  value={profile.phone}
                  onChange={(event) =>
                    updateProfile("phone", event.target.value)
                  }
                  placeholder="+1 555 123 4567"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className={cardClass} hidden={profileTab !== "personal"}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Personal details
                </h2>
                <p className="text-sm text-slate-500">
                  Used for personalization and security checks.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Identity
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Date of birth
                </label>
                <DateInput
                  value={profile.dob || ""}
                  onChange={(value) => updateProfile("dob", value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Country / Region
                </label>
                <input
                  type="text"
                  value={profile.country}
                  onChange={(event) =>
                    updateProfile("country", event.target.value)
                  }
                  placeholder="India"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Languages
                </label>
                <input
                  type="text"
                  value={profile.languages}
                  onChange={(event) =>
                    updateProfile("languages", event.target.value)
                  }
                  placeholder="English (United States), English (India)"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Time zone
                </label>
                <input
                  type="text"
                  value={preferences.timeZone}
                  onChange={(event) =>
                    updatePreferences("timeZone", event.target.value)
                  }
                  placeholder="Asia/Kolkata"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Regional format
                </label>
                <textarea
                  value={profile.regionFormat}
                  onChange={(event) =>
                    updateProfile("regionFormat", event.target.value)
                  }
                  placeholder="English (India); 31/08/2000; 01:01 - 23:59"
                  className={textareaClass}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Profile;
