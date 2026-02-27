import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";

const validateEmail = (value) => /.+@.+\..+/.test(value);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1.5 12s4-6.5 10.5-6.5S22.5 12 22.5 12s-4 6.5-10.5 6.5S1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 3l18 18" />
    <path d="M10.7 10.7a3.5 3.5 0 0 0 4.6 4.6" />
    <path d="M9.5 5.5C6 6.2 3.3 9 1.5 12c.9 1.6 2.1 3 3.6 4.1" />
    <path d="M14.5 5.5c2.3.6 4.3 2.3 6 5-1 1.7-2.3 3.1-3.8 4.2" />
    <path d="M12 8.5a3.5 3.5 0 0 1 3.5 3.5" />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ssoUrl = (import.meta.env.VITE_SSO_URL || "").trim();

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {
      email: email.trim() ? (validateEmail(email) ? "" : "Enter a valid work email") : "Email is required",
      password: password ? "" : "Password is required",
    };
    setErrors(nextErrors);
    setFormError("");
    setSuccess("");

    const hasError = Object.values(nextErrors).some(Boolean);
    if (hasError) return;

    setIsSubmitting(true);

    // TODO: replace with real authentication request
    setTimeout(() => {
      setIsSubmitting(false);
      setSuccess("Signed in — redirecting to dashboard");
      navigate("/");
    }, 400);
  };

  const handleSso = () => {
    if (!ssoUrl) {
      setFormError("SSO is not configured yet. Set VITE_SSO_URL in your environment to enable it.");
      return;
    }
    window.location.href = ssoUrl;
  };

  return (
    <AuthShell
      title="Sign in to your console"
      subtitle="Monitor inventory flows, manage purchase orders, and keep projects supplied."
      helper={
        <div className="flex items-center justify-between gap-4">
          <span>Need an account?</span>
          <Link to="/create-account" className="font-semibold text-emerald-300 hover:text-emerald-200">
            Create account
          </Link>
        </div>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {formError}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-100" htmlFor="email">Work email</label>
            {errors.email && <span className="text-xs text-rose-300">{errors.email}</span>}
          </div>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@bangaloreelectronics.com"
            className={`w-full rounded-xl border px-4 py-3 text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-800/70 ${
              errors.email ? "border-rose-500/60" : "border-slate-700"
            }`}
            aria-invalid={Boolean(errors.email)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-100" htmlFor="password">Password</label>
            {errors.password ? (
              <span className="text-xs text-rose-300">{errors.password}</span>
            ) : (
              <button type="button" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
                Forgot?
              </button>
            )}
          </div>
          <div className={`relative ${errors.password ? "group" : ""}`}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`w-full rounded-xl border px-4 py-3 pr-12 text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-800/70 ${
                errors.password ? "border-rose-500/60" : "border-slate-700"
              }`}
              aria-invalid={Boolean(errors.password)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-3 grid place-items-center text-slate-400 hover:text-slate-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-200">
          <input id="remember" type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-400" />
          <label htmlFor="remember" className="text-sm text-slate-200">Keep me signed in on this device</label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full inline-flex justify-center items-center gap-2 rounded-xl px-4 py-3 text-white font-semibold shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl ${
            isSubmitting ? "bg-emerald-500/70 cursor-not-allowed" : "bg-gradient-to-r from-emerald-600 to-teal-500"
          }`}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
          {isSubmitting && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={handleSso}
          className="w-full inline-flex justify-center items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
        >
          Continue with SSO
        </button>
      </form>
    </AuthShell>
  );
};

export default Login;
