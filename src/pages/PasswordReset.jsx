import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";
import { confirmPasswordReset, requestPasswordReset } from "../services/authService";

const PasswordReset = ({ requestOnly = false }) => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setError("");
    try {
      if (requestOnly) {
        const result = await requestPasswordReset(email); setMessage(result.message);
      } else {
        await confirmPasswordReset(token, password); setMessage("Password reset. You can now sign in.");
      }
    } catch (requestError) { setError(requestError.response?.data?.error || "The request could not be completed."); }
  };
  const inputClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-white";
  return <AuthShell title={requestOnly ? "Reset your password" : "Choose a new password"} subtitle={requestOnly ? "We will email a one-hour reset link if the account exists." : "This will sign out all existing sessions."} helper={<Link to="/login" className="font-semibold text-emerald-300">Back to sign in</Link>}>
    <form className="space-y-5" onSubmit={submit}>
      {requestOnly ? <label className="block text-sm text-slate-100">Work email<input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label> : <label className="block text-sm text-slate-100">New password<input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>}
      {message && <p className="text-sm text-emerald-300">{message}</p>}{error && <p className="text-sm text-rose-300">{error}</p>}
      <button className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white" disabled={!requestOnly && !token}>{requestOnly ? "Send reset link" : "Reset password"}</button>
    </form>
  </AuthShell>;
};
export default PasswordReset;
