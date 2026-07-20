import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";

const CreateAccount = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "Procurement",
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.firstName.trim()) nextErrors.firstName = "First name is required";
    if (!form.lastName.trim()) nextErrors.lastName = "Last name is required";
    if (!/.+@.+\..+/.test(form.email)) nextErrors.email = "Enter a valid email";
    if (!form.password) nextErrors.password = "Password is required";
    if (form.password !== form.confirmPassword) nextErrors.confirmPassword = "Passwords must match";
    if (!form.terms) nextErrors.terms = "Please agree to the terms";
    setErrors(nextErrors);
    setSubmitting(false);
    
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      navigate("/login");
    }, 400);
  };

  const inputClass = (hasError) =>
    `w-full rounded-xl border px-4 py-3 text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-800/70 ${
      hasError ? "border-rose-500/60" : "border-slate-700"
    }`;

  const labelClass = "text-sm font-medium text-slate-100";
  const helperClass = "text-xs text-rose-300";

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up access for procurement, warehouse, and project teams in one place."
      helper={
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span>Already onboarded?</span>
          <Link to="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">
            Sign in
          </Link>
        </div>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClass} htmlFor="firstName">First name</label>
            <input
              id="firstName"
              type="text"
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              className={inputClass(errors.firstName)}
            />
            {errors.firstName && <span className={helperClass}>{errors.firstName}</span>}
          </div>
          <div className="space-y-2">
            <label className={labelClass} htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              type="text"
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              className={inputClass(errors.lastName)}
            />
            {errors.lastName && <span className={helperClass}>{errors.lastName}</span>}
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="company">Company / Unit</label>
          <input
            id="company"
            type="text"
            placeholder="e.g., BE Procurement"
            value={form.company}
            onChange={(e) => updateField("company", e.target.value)}
            className={inputClass(false)}
          />
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            className={inputClass(errors.email)}
          />
          {errors.email && <span className={helperClass}>{errors.email}</span>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClass} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              className={inputClass(errors.password)}
            />
            {errors.password && <span className={helperClass}>{errors.password}</span>}
          </div>
          <div className="space-y-2">
            <label className={labelClass} htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              className={inputClass(errors.confirmPassword)}
            />
            {errors.confirmPassword && <span className={helperClass}>{errors.confirmPassword}</span>}
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="role">Account role</label>
          <select
            id="role"
            value={form.role}
            onChange={(e) => updateField("role", e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-slate-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option>Procurement</option>
            <option>Warehouse</option>
            <option>Project Manager</option>
            <option>Finance</option>
            <option>Admin</option>
          </select>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="terms"
            type="checkbox"
            checked={form.terms}
            onChange={(e) => updateField("terms", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-400"
          />
          <label htmlFor="terms" className="text-sm text-slate-200">
            I agree to the Bangalore Electronics terms and understand role-based access may be reviewed.
          </label>
        </div>
        {errors.terms && <span className={helperClass}>{errors.terms}</span>}

        <button
          type="submit"
          disabled={submitting}
          className={`w-full inline-flex justify-center items-center gap-2 rounded-xl px-4 py-3 text-white font-semibold shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl ${
            submitting ? "bg-emerald-500/70 cursor-not-allowed" : "bg-gradient-to-r from-emerald-600 to-teal-500"
          }`}
        >
          {submitting ? "Creating account�" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
};

export default CreateAccount;
