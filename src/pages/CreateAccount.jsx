import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";
import { register } from "../services/authService";

const CreateAccount = () => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (!token) return setError("This page requires a valid email invitation.");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");
    setSubmitting(true);
    try { await register({ token, password: form.password }); navigate("/login", { replace: true }); }
    catch (requestError) { setError(requestError.response?.data?.error || "The invitation could not be accepted."); }
    finally { setSubmitting(false); }
  };
  const inputClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20";
  return <AuthShell title="Accept your invitation" subtitle="Choose a secure password to activate your workspace account." helper={<Link to="/login" className="font-semibold text-emerald-300">Back to sign in</Link>}>
    <form className="space-y-5" onSubmit={submit}>
      {!token && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">Public registration is disabled. Ask an administrator to send you an invitation.</p>}
      <label className="block text-sm font-medium text-slate-100">Password<input className={inputClass} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label className="block text-sm font-medium text-slate-100">Confirm password<input className={inputClass} type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></label>
      <p className="text-xs text-slate-300">Use at least 12 characters with uppercase, lowercase, number, and symbol.</p>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={submitting || !token}>{submitting ? "Activating…" : "Activate account"}</button>
    </form>
  </AuthShell>;
};
export default CreateAccount;
