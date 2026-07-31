import {
  Bell, Building2, ChevronDown, Eye, Package, KeyRound,
  Laptop, Loader2, MonitorCog, Save, Search, ShieldCheck, UserRound,
  UsersRound, X,
} from "lucide-react";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  addPasskey, changePassword, confirmTotp, getAuditEvents, getPasskeys, getRoles, getSessions,
  loadSettingsFromApis, getUsers, inviteUser, revokeAllSessions, revokeSession,
  saveAppearance, saveNotifications, saveProfile, saveWorkspaceSetting, setupTotp,
  updateUser, revokeUserSessions, sendUserPasswordReset, removePasskey,
  regenerateRecoveryCodes, setStepUpFallbackHandler, stepUpWithPassword,
} from "../../services/settingsApi";
import { saveSettings as updateSettingsContext } from "../../services/settingsStore";

const NAV = [
  ["profile", "My Profile", "Your identity and sessions", UserRound, "personal"],
  ["organization", "Organization", "Workspace details", Building2, "admin"],
  ["users", "Users & Roles", "People and permissions", UsersRound, "admin"],
  ["security", "Security", "Password, 2FA and policy", ShieldCheck, "personal"],
  ["inventory", "Inventory Defaults", "Stock and valuation rules", Package, "admin"],
  ["notifications", "Notifications", "Alerts and summaries", Bell, "personal"],
  ["appearance", "Appearance", "Theme and regional format", MonitorCog, "personal"],
  ["audit", "Audit Log", "Sensitive activity history", Eye, "audit"],
];
const inputClass = "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
const buttonPrimary = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:opacity-50";
const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));

const Card = ({ title, description, children, action }) => (
  <section className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      {action}
    </div>
    {children}
  </section>
);
const Field = ({ label, hint, ...props }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}<input className={inputClass} {...props} />
    {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </label>
);
const Toggle = ({ checked, onChange, label, description }) => (
  <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-slate-200 p-4">
    <span><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
    <input type="checkbox" className="peer sr-only" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus:ring-4 peer-focus:ring-blue-100 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
  </label>
);
const Grid = ({ children }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
const Status = ({ state }) => state ? (
  <div className={`rounded-xl border px-4 py-3 text-sm ${state.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
    {state.message}
  </div>
) : null;

const ProfilePanel = ({ value, setValue, sessions, reloadSessions }) => (
  <div className="space-y-5">
    <Card title="Profile details" description="Your role and email are managed by an administrator.">
      <div className="mb-6 flex items-center gap-4">
        {value.avatar ? <img src={value.avatar} alt="" className="h-16 w-16 rounded-2xl border border-slate-200 object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-xl font-bold text-blue-700">{String(value.name || "U").slice(0, 2).toUpperCase()}</div>}
        <div><p className="font-semibold text-slate-900">{value.name}</p><p className="text-sm text-slate-500">{value.role}</p><label className="mt-2 inline-flex cursor-pointer text-xs font-semibold text-blue-600">Change avatar<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setValue({ ...value, avatar: String(reader.result) }); reader.readAsDataURL(file); }} /></label></div>
      </div>
      <Grid>
        <Field label="Full name" value={value.name || ""} onChange={(e) => setValue({ ...value, name: e.target.value })} />
        <Field label="Email" value={value.email || ""} disabled />
        <Field label="Phone" value={value.phone || ""} onChange={(e) => setValue({ ...value, phone: e.target.value })} />
        <Field label="Job title" value={value.jobTitle || ""} onChange={(e) => setValue({ ...value, jobTitle: e.target.value })} />
        <Field label="Department" value={value.department || ""} onChange={(e) => setValue({ ...value, department: e.target.value })} />
        <Field label="Role" value={value.role || ""} disabled />
      </Grid>
    </Card>
    <SessionsCard sessions={sessions} reload={reloadSessions} />
  </div>
);

const SessionsCard = ({ sessions, reload }) => (
  <Card title="Active sessions" description="Devices currently signed in to your account." action={<button className={buttonSecondary} type="button" onClick={async () => { await revokeAllSessions(); window.location.assign("/login"); }}>Sign out all</button>}>
    <div className="divide-y divide-slate-100">
      {sessions.map((session) => (
        <div key={session.id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3"><Laptop className="h-5 w-5 shrink-0 text-slate-400" /><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{session.userAgent || "Unknown browser"}</p><p className="text-xs text-slate-500">{session.ipAddress || "Unknown IP"} · {new Date(session.lastSeenAt).toLocaleString()}</p></div></div>
          <button type="button" className="text-sm font-semibold text-rose-600" onClick={async () => { await revokeSession(session.id); await reload(); }}>{session.currentSession ? "Sign out" : "Revoke"}</button>
        </div>
      ))}
      {!sessions.length && <p className="py-6 text-center text-sm text-slate-500">No active sessions found.</p>}
    </div>
  </Card>
);

const OrganizationPanel = ({ value, setValue }) => <Card title="Organization" description="Core business information used across documents and exports."><Grid>
  {[
    ["name", "Workspace name"], ["email", "Business email"], ["phone", "Phone"],
    ["gstin", "GSTIN"], ["address", "Address"], ["city", "City"], ["state", "State"], ["pincode", "PIN code"],
  ].map(([key, label]) => <Field key={key} label={label} value={value[key] || ""} onChange={(e) => setValue({ ...value, [key]: e.target.value })} />)}
</Grid></Card>;

const InventoryPanel = ({ value, setValue }) => <Card title="Inventory defaults" description="Defaults applied to new stock records.">
  <Grid>
    <Field label="Default unit" value={value.defaultUnit || ""} onChange={(e) => setValue({ ...value, defaultUnit: e.target.value })} />
    <Field label="Valuation method" value={value.valuationMethod || "FIFO"} onChange={(e) => setValue({ ...value, valuationMethod: e.target.value })} />
    <Field label="Low-stock threshold" type="number" min="0" value={value.lowStockThreshold ?? 0} onChange={(e) => setValue({ ...value, lowStockThreshold: Number(e.target.value) })} />
    <Field label="Reorder level" type="number" min="0" value={value.reorderLevel ?? 0} onChange={(e) => setValue({ ...value, reorderLevel: Number(e.target.value) })} />
  </Grid>
  <div className="mt-5 grid gap-3">
    <Toggle label="Allow negative stock" description="Allow transactions to take stock below zero." checked={value.allowNegativeStock} onChange={(checked) => setValue({ ...value, allowNegativeStock: checked })} />
    <Toggle label="Automatic reorder" description="Create reorder suggestions at the configured level." checked={value.autoReorder} onChange={(checked) => setValue({ ...value, autoReorder: checked })} />
    <Toggle label="Batch tracking" description="Track lot and batch identifiers for stock." checked={value.trackBatch} onChange={(checked) => setValue({ ...value, trackBatch: checked })} />
  </div>
</Card>;

const NotificationsPanel = ({ value, setValue }) => <Card title="Notification preferences" description="Choose the updates you want to receive."><div className="grid gap-3">
  {[["email", "Email notifications", "Send operational alerts by email."], ["sms", "SMS notifications", "Send urgent alerts by SMS."], ["lowStock", "Low-stock alerts", "Notify when items cross their threshold."], ["weeklySummary", "Weekly summary", "Receive a weekly workspace digest."], ["projectUpdates", "Project updates", "Notify about task, milestone, and report changes."]].map(([key, label, description]) => <Toggle key={key} checked={value[key]} onChange={(checked) => setValue({ ...value, [key]: checked })} label={label} description={description} />)}
</div></Card>;

const AppearancePanel = ({ value, setValue }) => <Card title="Appearance and region" description="Personal display and formatting preferences."><Grid>
  {[["theme", "Theme", ["Light", "Dark", "System"]], ["language", "Language", ["English"]], ["dateFormat", "Date format", ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]], ["timeZone", "Time zone", ["Asia/Kolkata", "UTC"]]].map(([key, label, options]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<select className={inputClass} value={value[key] || ""} onChange={(e) => setValue({ ...value, [key]: e.target.value })}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>)}
</Grid></Card>;

const SecurityPanel = ({ policy, setPolicy, canAdmin, twoFactorEnabled, sessions, reloadSessions }) => {
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [totp, setTotp] = useState(null);
  const [code, setCode] = useState("");
  const [passkeys, setPasskeys] = useState([]);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [passkeyName, setPasskeyName] = useState("This device");
  const [message, setMessage] = useState("");
  const loadPasskeys = async () => setPasskeys(await getPasskeys());
  // Loading remote security state is the purpose of this mount effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadPasskeys().catch(() => {}); }, []);
  const change = async () => {
    if (passwords.newPassword !== passwords.confirm) return setMessage("New passwords do not match.");
    try { await changePassword(passwords); setMessage("Password changed. Sign in again."); } catch (error) { setMessage(error.response?.data?.error || "Password change failed."); }
  };
  return <div className="space-y-5">
    <Card title="Password" description="Changing your password signs out every device."><Grid>
      <Field label="Current password" type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} />
      <span />
      <Field label="New password" type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} hint="At least 14 characters; known breached and common passwords are rejected." />
      <Field label="Confirm new password" type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
    </Grid><div className="mt-4 flex items-center gap-3"><button type="button" className={buttonSecondary} onClick={change}>Change password</button>{message && <p className="text-sm text-slate-600">{message}</p>}</div>
    </Card>
    <Card title="Passkeys" description="Use device biometrics, Windows Hello, or a security key for phishing-resistant sign-in.">
      <div className="space-y-3">
        {passkeys.map((passkey) => <div key={passkey.credentialId} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"><div><p className="font-semibold text-slate-800">{passkey.deviceName}</p><p className="text-xs text-slate-500">Added {new Date(passkey.createdAt).toLocaleDateString()} · Last used {passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleString() : "Never"}</p></div><button type="button" className="text-sm font-semibold text-rose-600" disabled={passkeys.length <= 1} onClick={async () => { await removePasskey(passkey.credentialId); await loadPasskeys(); }}>Remove</button></div>)}
        <div className="flex flex-col gap-3 sm:flex-row"><Field label="New passkey name" value={passkeyName} onChange={(e) => setPasskeyName(e.target.value)} /><button type="button" className={`${buttonSecondary} sm:mt-6`} onClick={async () => { await addPasskey(passkeyName); await loadPasskeys(); }}><KeyRound className="h-4 w-4" />Add passkey</button></div>
      </div>
    </Card>
    <Card title="Authenticator app" description="Protect sensitive actions with time-based one-time codes.">
      {twoFactorEnabled ? <p className="text-sm font-semibold text-emerald-700">Authenticator protection is enabled. Contact a Super Admin for audited recovery if you lose access.</p> : !totp ? <div><p className="mb-4 text-sm text-slate-600">Optional: add an authenticator for stronger password sign-in protection.</p><button type="button" className={buttonSecondary} onClick={async () => setTotp(await setupTotp())}><KeyRound className="h-4 w-4" />Set up authenticator</button></div> : <div className="grid gap-4 sm:grid-cols-[160px_1fr]"><img className="h-40 w-40 rounded-xl border" src={totp.qrCode} alt="Authenticator QR code" /><div><p className="text-sm text-slate-600">Scan the QR code, then enter the six-digit code.</p><Field label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} /><button type="button" className={`${buttonPrimary} mt-3`} onClick={async () => { const result = await confirmTotp(code); setTotp({ ...totp, recoveryCodes: result.recoveryCodes }); }}>Confirm authenticator</button>{totp.recoveryCodes && <p className="mt-3 break-words text-xs text-slate-600">Recovery codes: {totp.recoveryCodes.join(", ")}</p>}</div></div>}
    </Card>
    {twoFactorEnabled && <Card title="Recovery codes" description="Regenerating codes invalidates every previous recovery code. Each new code can be used once."><button type="button" className={buttonSecondary} onClick={async () => { const result = await regenerateRecoveryCodes(); setRecoveryCodes(result.recoveryCodes || []); }}>Generate new recovery codes</button>{recoveryCodes.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="mb-3 text-sm font-semibold text-amber-950">Save these codes now. They will not be shown again.</p><div className="grid grid-cols-2 gap-2 font-mono text-sm text-amber-950">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div></div>}</Card>}
    <SessionsCard sessions={sessions} reload={reloadSessions} />
    {canAdmin && <Card title="Workspace security policy" description="Defaults enforced by the server for every account."><Grid>
      <Field label="Inactivity timeout (minutes)" type="number" min="5" value={policy.inactivityTimeoutMinutes ?? 30} onChange={(e) => setPolicy({ ...policy, inactivityTimeoutMinutes: Number(e.target.value) })} />
      <Field label="Password expiry (days)" type="number" min="0" value={policy.passwordExpiryDays ?? 90} onChange={(e) => setPolicy({ ...policy, passwordExpiryDays: Number(e.target.value) })} />
      <Field label="Failed login limit" type="number" min="3" max="10" value={policy.failedLoginLimit ?? 5} onChange={(e) => setPolicy({ ...policy, failedLoginLimit: Number(e.target.value) })} />
      <Field label="Account lock (minutes)" type="number" min="5" value={policy.accountLockMinutes ?? 15} onChange={(e) => setPolicy({ ...policy, accountLockMinutes: Number(e.target.value) })} />
    </Grid></Card>}
  </div>;
};

const UsersPanel = ({ users, roles, reload }) => {
  const [query, setQuery] = useState("");
  const [invite, setInvite] = useState(null);
  const visible = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const sendInvite = async () => { await inviteUser(invite); setInvite(null); await reload(); };
  return <div className="space-y-5">
    <Card title="Users" description="Invite people, assign predefined roles, and manage account status." action={<button className={buttonPrimary} type="button" onClick={() => setInvite({ name: "", email: "", role: "Project User", department: "", jobTitle: "" })}>Invite user</button>}>
      <div className="relative mb-4"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input className={`${inputClass} mt-0 pl-9`} placeholder="Search users" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">User</th><th className="px-3">Role</th><th className="px-3">Status</th><th className="px-3">2FA</th><th className="px-3">Last login</th><th className="px-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map((user) => <tr key={user.id}>
        <td className="px-3 py-4"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></td>
        <td className="px-3"><select className="h-10 rounded-lg border border-slate-200 px-2" value={user.role} onChange={async (e) => { await updateUser(user.id, { role: e.target.value }); await reload(); }}>{roles.map((role) => <option key={role.name}>{role.name}</option>)}</select></td>
        <td className="px-3"><button className={`rounded-full px-3 py-1 text-xs font-semibold ${user.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`} onClick={async () => { await updateUser(user.id, { status: user.status === "Active" ? "Inactive" : "Active" }); await reload(); }}>{user.status}</button></td>
        <td className="px-3">{user.twoFactorEnabled ? "Enabled" : "Not enabled"}</td><td className="px-3 text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td><td className="px-3"><div className="flex gap-2"><button className="text-xs font-semibold text-blue-600" onClick={async () => { const reason = window.prompt("Enter the audited reason for this password reset"); if (reason) await sendUserPasswordReset(user.id, reason); }}>Reset password</button><button className="text-xs font-semibold text-rose-600" onClick={async () => { await revokeUserSessions(user.id); }}>Revoke sessions</button></div></td>
      </tr>)}</tbody></table></div>
    </Card>
    <Card title="Role permissions" description="Permission definitions are maintained by the server and cannot be edited here."><div className="space-y-3">{roles.map((role) => <details key={role.name} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold text-slate-800">{role.name}</summary><div className="mt-3 flex flex-wrap gap-2">{role.permissions.map((permission) => <span key={permission} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{permission === "*" ? "All permissions" : permission}</span>)}</div></details>)}</div></Card>
    {invite && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-lg rounded-[20px] bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Invite user</h2><button onClick={() => setInvite(null)}><X /></button></div><Grid>
      <Field label="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /><Field label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
      <Field label="Department" value={invite.department} onChange={(e) => setInvite({ ...invite, department: e.target.value })} /><Field label="Job title" value={invite.jobTitle} onChange={(e) => setInvite({ ...invite, jobTitle: e.target.value })} />
      <label className="text-sm font-medium text-slate-700">Role<select className={inputClass} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>{roles.map((role) => <option key={role.name}>{role.name}</option>)}</select></label>
    </Grid><div className="mt-6 flex justify-end gap-3"><button className={buttonSecondary} onClick={() => setInvite(null)}>Cancel</button><button className={buttonPrimary} onClick={sendInvite}>Send invitation</button></div></div></div>}
  </div>;
};

const AuditPanel = ({ audit }) => <Card title="Audit log" description="Immutable records of sensitive workspace activity."><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="px-3 py-3">Time</th><th className="px-3">Actor</th><th className="px-3">Action</th><th className="px-3">Target</th><th className="px-3">Result</th></tr></thead><tbody className="divide-y">{audit.map((event) => <tr key={event.id}><td className="px-3 py-4 text-slate-500">{new Date(event.createdAt).toLocaleString()}</td><td className="px-3">{event.actorName || "System"}<span className="block text-xs text-slate-500">{event.actorEmail}</span></td><td className="px-3 font-medium">{event.action}</td><td className="px-3">{event.targetType} {event.targetId}</td><td className="px-3">{event.result}</td></tr>)}</tbody></table>{!audit.length && <p className="py-10 text-center text-sm text-slate-500">No audit events found.</p>}</div></Card>;

const SettingsPage = () => {
  const [active, setActive] = useState("profile");
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [baseline, setBaseline] = useState("{}");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stepUp, setStepUp] = useState(null);
  const stepUpResolver = useRef(null);
  const [users, setUsers] = useState([]), [roles, setRoles] = useState([]), [sessions, setSessions] = useState([]), [audit, setAudit] = useState([]);

  useEffect(() => setStepUpFallbackHandler((scope) => new Promise((resolve, reject) => {
    stepUpResolver.current = { resolve, reject };
    setStepUp({ scope, password: "", code: "", error: "", busy: false });
  })), []);
  const closeStepUp = (error = new Error("Verification cancelled")) => {
    stepUpResolver.current?.reject(error);
    stepUpResolver.current = null;
    setStepUp(null);
  };
  const submitStepUp = async () => {
    setStepUp((current) => ({ ...current, busy: true, error: "" }));
    try {
      await stepUpWithPassword(stepUp.scope, stepUp.password, stepUp.code);
      stepUpResolver.current?.resolve();
      stepUpResolver.current = null;
      setStepUp(null);
    } catch (error) {
      setStepUp((current) => ({ ...current, busy: false, error: error.response?.data?.error || "Verification failed." }));
    }
  };

  useEffect(() => { loadSettingsFromApis().then((result) => { setData(result); setForm(clone(result.profile)); setBaseline(JSON.stringify(result.profile)); }).catch((error) => setStatus({ type: "error", message: error.response?.data?.error || "Settings could not be loaded." })); }, []);
  const capabilities = data?.capabilities || {};
  const nav = NAV.filter(([, , , , ownership]) => ownership === "personal" || (ownership === "admin" && capabilities.manageWorkspace) || (ownership === "audit" && capabilities.viewAudit));
  const categoryValue = useMemo(() => {
    if (!data) return {};
    if (active === "profile") return data.profile;
    if (active === "notifications" || active === "appearance") return data[active];
    return data.workspace?.[active] || {};
  }, [active, data]);
  const dirty = JSON.stringify(form) !== baseline;
  const loadSessions = async () => setSessions(await getSessions());
  const loadUsers = async () => setUsers(await getUsers());
  useEffect(() => {
    if (!data) return;
    // Category changes intentionally replace the independently saved form.
    const value = clone(categoryValue); setForm(value); setBaseline(JSON.stringify(value)); setStatus(null);
    if (active === "profile" || active === "security") loadSessions().catch(() => {});
    if (active === "users") Promise.all([loadUsers(), getRoles().then(setRoles)]).catch((e) => setStatus({ type: "error", message: e.response?.data?.error || "Users could not be loaded." }));
    if (active === "audit") getAuditEvents().then((result) => setAudit(result.events)).catch(() => {});
  }, [active, data, categoryValue]);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const choose = (id) => { if (!dirty || window.confirm("Discard unsaved changes in this category?")) setActive(id); };
  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      let saved = form;
      if (active === "profile") saved = await saveProfile(form);
      else if (active === "notifications") saved = await saveNotifications(form);
      else if (active === "appearance") saved = await saveAppearance(form);
      else if (["organization", "inventory"].includes(active)) saved = await saveWorkspaceSetting(active, form);
      else if (active === "security" && capabilities.manageWorkspace) saved = await saveWorkspaceSetting("security", form);
      setData((current) => {
        const next = clone(current);
        if (active === "profile" || active === "notifications" || active === "appearance") next[active] = saved;
        else next.workspace[active] = saved;
        return next;
      });
      setForm(clone(saved)); setBaseline(JSON.stringify(saved)); setStatus({ type: "success", message: "Changes saved." });
      const current = clone(data); if (active === "profile") current.profile = saved; if (active === "organization") current.workspace.organization = saved; if (active === "inventory") current.workspace.inventory = saved; if (active === "notifications") current.notifications = saved; if (active === "appearance") current.appearance = saved;
      updateSettingsContext({ profile: current.profile, company: current.workspace?.organization || {}, inventory: current.workspace?.inventory || {}, notifications: current.notifications, preferences: current.appearance, security: current.workspace?.security || {} });
    } catch (error) { setStatus({ type: "error", message: error.response?.data?.error || "Changes could not be saved." }); } finally { setSaving(false); }
  };
  if (!data) return <div className="grid min-h-[420px] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>;
  const activeMeta = nav.find(([id]) => id === active) || nav[0];
  const saveable = ["profile", "organization", "security", "inventory", "notifications", "appearance"].includes(active);
  return <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">{data.workspace?.organization?.name || "Workspace"}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Settings</h1><p className="mt-1 text-sm text-slate-500">Manage your account, workspace, users, and security.</p></div>
      {saveable && <div className="flex items-center gap-3">{dirty && <span className="text-sm font-medium text-amber-700">Unsaved changes</span>}<button className={buttonSecondary} type="button" disabled={!dirty} onClick={() => setForm(JSON.parse(baseline))}>Discard Changes</button><button className={buttonPrimary} type="button" disabled={!dirty || saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Changes</button></div>}
    </header>
    <div className="mb-5 lg:hidden"><label className="text-sm font-medium text-slate-700">Settings category<div className="relative"><select className={`${inputClass} appearance-none pr-10`} value={active} onChange={(e) => choose(e.target.value)}>{nav.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-400" /></div></label></div>
    <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="hidden self-start rounded-[20px] border border-slate-200 bg-white p-2 shadow-sm lg:block">{nav.map(([id, label, description, icon]) => <button key={id} onClick={() => choose(id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${active === id ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${active === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{createElement(icon, { className: "h-4 w-4" })}</span><span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs opacity-70">{description}</span></span></button>)}</aside>
      <main className="min-w-0 space-y-4"><div><h2 className="text-2xl font-bold text-slate-950">{activeMeta[1]}</h2><p className="mt-1 text-sm text-slate-500">{activeMeta[2]}</p></div><Status state={status} />
        {active === "profile" && <ProfilePanel value={form} setValue={setForm} sessions={sessions} reloadSessions={loadSessions} />}
        {active === "organization" && <OrganizationPanel value={form} setValue={setForm} />}
        {active === "users" && <UsersPanel users={users} roles={roles} reload={loadUsers} />}
        {active === "security" && <SecurityPanel policy={form} setPolicy={setForm} canAdmin={capabilities.manageWorkspace} twoFactorEnabled={data.profile?.twoFactorEnabled} sessions={sessions} reloadSessions={loadSessions} />}
        {active === "inventory" && <InventoryPanel value={form} setValue={setForm} />}
        {active === "notifications" && <NotificationsPanel value={form} setValue={setForm} />}
        {active === "appearance" && <AppearancePanel value={form} setValue={setForm} />}
        {active === "audit" && <AuditPanel audit={audit} />}
      </main>
    </div>
    {stepUp && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="step-up-title"><div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-2xl"><h2 id="step-up-title" className="text-xl font-bold text-slate-950">Verify your identity</h2><p className="mt-2 text-sm text-slate-600">Passkey verification was not completed. Use your password and authenticator as a fallback for this action only.</p>{stepUp.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{stepUp.error}</p>}<div className="mt-5 space-y-4"><Field autoFocus label="Password" type="password" autoComplete="current-password" value={stepUp.password} onChange={(e) => setStepUp({ ...stepUp, password: e.target.value })} /><Field label="Authenticator or recovery code" autoComplete="one-time-code" value={stepUp.code} onChange={(e) => setStepUp({ ...stepUp, code: e.target.value })} /></div><div className="mt-6 flex justify-end gap-3"><button type="button" className={buttonSecondary} onClick={() => closeStepUp()}>Cancel</button><button type="button" className={buttonPrimary} disabled={stepUp.busy || !stepUp.password || !stepUp.code} onClick={submitStepUp}>{stepUp.busy && <Loader2 className="h-4 w-4 animate-spin" />}Verify</button></div></div></div>}
  </div>;
};
export default SettingsPage;
