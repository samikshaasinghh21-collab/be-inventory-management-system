import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/images/bangalore-electronics-logo.png";

const validateEmail = (value) => /.+@.+\..+/.test(value);

const stagger = (index) => ({ animationDelay: `${180 + index * 95}ms` });

const MailIcon = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="m4.2 7.2 7.8 6 7.8-6" />
  </svg>
);

const LockIcon = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2.4" />
    <path d="M8.5 10V7.6a3.5 3.5 0 0 1 7 0V10" />
    <path d="M12 14v2" />
  </svg>
);

const EyeIcon = ({ hidden }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 transition-transform duration-300" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {hidden ? (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.7 10.7a3.5 3.5 0 0 0 4.6 4.6" />
        <path d="M9.5 5.5C6 6.2 3.3 9 1.5 12c.8 1.5 2 2.9 3.6 4.1" />
        <path d="M14.4 5.5c2.4.6 4.4 2.3 6.1 5-.9 1.6-2.2 3-3.8 4.2" />
      </>
    ) : (
      <>
        <path d="M1.5 12s4-6.5 10.5-6.5S22.5 12 22.5 12s-4 6.5-10.5 6.5S1.5 12 1.5 12Z" />
        <circle cx="12" cy="12" r="3.5" />
      </>
    )}
  </svg>
);

const ArrowIcon = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 12h13" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 login-checkmark" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <path d="m5 12.5 4.2 4.2L19.5 6.5" />
  </svg>
);

const ThemeIcon = ({ dark }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {dark ? (
      <path d="M20 14.4A7.8 7.8 0 0 1 9.6 4a8 8 0 1 0 10.4 10.4Z" />
    ) : (
      <>
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.5 12h2M19.5 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4" />
      </>
    )}
  </svg>
);

const SocialIcon = ({ type }) => {
  if (type === "google") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.3Z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5L15.4 17c-.9.6-2 .9-3.4.9a5.9 5.9 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.5 13.9a6 6 0 0 1 0-3.8V7.5H3.2a10 10 0 0 0 0 9l3.3-2.6Z" />
        <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2 10 10 0 0 0 3.2 7.5l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z" />
      </svg>
    );
  }

  if (type === "microsoft") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path fill="#F25022" d="M3 3h8v8H3z" />
        <path fill="#7FBA00" d="M13 3h8v8h-8z" />
        <path fill="#00A4EF" d="M3 13h8v8H3z" />
        <path fill="#FFB900" d="M13 13h8v8h-8z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16.7 12.7c0-2 1.7-3 1.8-3.1-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.5-.4 6.1 1 8.1.7 1 1.5 2.1 2.6 2 .9 0 1.3-.6 2.5-.6 1.1 0 1.5.6 2.5.6 1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0-.1-2.1-.8-2.1-3.1ZM14.8 6.8c.6-.7 1-1.7.9-2.6-.9 0-1.9.6-2.5 1.3-.6.7-1 1.6-.9 2.5 1 .1 1.9-.5 2.5-1.2Z" />
    </svg>
  );
};

const FloatingInput = ({ error, icon, id, label, rightAction, ...props }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label className="login-field-label text-sm font-semibold text-slate-900 transition-colors duration-300" htmlFor={id}>
        {label}
      </label>
      {error && <span className="text-xs font-medium text-rose-500">{error}</span>}
    </div>
    <div className={`login-input-wrap ${error ? "login-input-error" : ""}`}>
      <span className="login-field-icon pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-slate-400 transition-colors duration-300">
        {icon}
      </span>
      <input
        id={id}
        className="peer h-16 w-full rounded-[18px] border border-slate-200 bg-white/80 px-16 pt-5 text-base font-medium text-slate-950 shadow-[0_16px_45px_rgba(15,23,42,0.06)] outline-none transition duration-300 placeholder:text-transparent focus:border-emerald-600 focus:bg-white focus:shadow-[0_18px_55px_rgba(0,105,82,0.16)] focus:ring-4 focus:ring-emerald-700/10"
        placeholder=" "
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      <span className="login-floating-placeholder pointer-events-none absolute left-16 top-1/2 -translate-y-1/2 text-base text-slate-400 transition-all duration-300 peer-focus:top-4 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-emerald-700 peer-[:not(:placeholder-shown)]:top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-semibold">
        {props.placeholder}
      </span>
      {rightAction}
    </div>
    {error && (
      <p id={`${id}-error`} className="sr-only">
        {error}
      </p>
    )}
  </div>
);

const DashboardIllustration = () => (
  <div className="login-inventory-scene animate-login-float" aria-hidden="true">
    <svg viewBox="0 0 760 560" className="h-full w-full overflow-hidden">
      <defs>
        <linearGradient id="bePanelGradient" x1="108" x2="620" y1="44" y2="402" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f4f7f8" />
          <stop offset="1" stopColor="#e4eceb" />
        </linearGradient>
        <linearGradient id="beScreenShade" x1="160" x2="594" y1="72" y2="380" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#cddad8" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id="beChartFill" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#18a77e" stopOpacity="0.32" />
          <stop offset="1" stopColor="#18a77e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beBoxTop" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#f0cc8e" />
          <stop offset="1" stopColor="#d7a158" />
        </linearGradient>
        <linearGradient id="beBoxFront" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#dca85f" />
          <stop offset="1" stopColor="#b87c37" />
        </linearGradient>
        <filter id="beSoftShadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="28" floodColor="#001f1c" floodOpacity="0.32" stdDeviation="24" />
        </filter>
        <filter id="beTinyShadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="10" floodColor="#001f1c" floodOpacity="0.22" stdDeviation="8" />
        </filter>
      </defs>

      <ellipse cx="400" cy="492" rx="285" ry="44" fill="#022f2b" opacity="0.34" />

      <g filter="url(#beSoftShadow)" transform="rotate(-7 380 222)">
        <rect x="130" y="54" width="500" height="332" rx="28" fill="url(#bePanelGradient)" stroke="#ffffff" strokeWidth="10" />
        <path d="M146 86h468v58H146z" fill="url(#beScreenShade)" opacity="0.42" />
        <image href={logo} x="166" y="102" width="118" height="36" preserveAspectRatio="xMinYMid meet" />
        <rect x="520" y="107" width="76" height="7" rx="3.5" fill="#e7edf4" />

        <rect x="164" y="164" width="148" height="42" rx="10" fill="#004c43" />
        {[0, 1, 2, 3, 4].map((item) => (
          <g key={item} transform={`translate(166 ${232 + item * 34})`}>
            <circle cx="8" cy="8" r="8" fill="#e9eef5" />
            <rect x="32" y="4" width="96" height="8" rx="4" fill="#e6ecf1" />
          </g>
        ))}

        <g filter="url(#beTinyShadow)">
          <rect x="338" y="164" width="130" height="112" rx="18" fill="#ffffff" />
          <text x="358" y="194" fill="#94a3b8" fontSize="14" fontWeight="700">Total Orders</text>
          <text x="358" y="234" fill="#071733" fontSize="32" fontWeight="800">1,320</text>
          <text x="358" y="260" fill="#10b981" fontSize="16" fontWeight="800">+ 8.6%</text>
        </g>

        <g filter="url(#beTinyShadow)">
          <rect x="486" y="164" width="116" height="112" rx="18" fill="#ffffff" />
          <text x="504" y="194" fill="#94a3b8" fontSize="13" fontWeight="700">Low Stock</text>
          <text x="504" y="234" fill="#071733" fontSize="32" fontWeight="800">23</text>
          <text x="504" y="260" fill="#f43f5e" fontSize="16" fontWeight="800">- 4.3%</text>
        </g>

        <g filter="url(#beTinyShadow)">
          <rect x="338" y="296" width="264" height="118" rx="18" fill="#ffffff" />
          <text x="358" y="326" fill="#172033" fontSize="14" fontWeight="800">Stock Overview</text>
          {[0, 1, 2].map((line) => (
            <path key={line} d={`M358 ${352 + line * 25}h210`} stroke="#e2e8f0" strokeWidth="1.5" />
          ))}
          <path d="M358 390 C390 364 414 348 452 354 C488 360 500 372 528 348 C546 332 564 336 582 344 L582 404 H358Z" fill="url(#beChartFill)" />
          <path d="M358 390 C390 364 414 348 452 354 C488 360 500 372 528 348 C546 332 564 336 582 344" fill="none" stroke="#238f70" strokeLinecap="round" strokeWidth="5" />
          {[358, 452, 528, 582].map((x, index) => (
            <circle key={x} cx={x} cy={[390, 354, 348, 344][index]} r="5" fill="#238f70" />
          ))}
        </g>
      </g>

      <g filter="url(#beTinyShadow)" transform="translate(86 372)">
        <g transform="translate(0 56)">
          <path d="M0 0h84l20 14H20z" fill="url(#beBoxTop)" />
          <rect x="20" y="14" width="84" height="44" fill="url(#beBoxFront)" />
          <path d="M0 0l20 14v44L0 44z" fill="#c08a43" />
        </g>
        <g transform="translate(94 56)">
          <path d="M0 0h88l22 15H22z" fill="url(#beBoxTop)" />
          <rect x="22" y="15" width="88" height="56" fill="url(#beBoxFront)" />
          <path d="M0 0l22 15v56L0 56z" fill="#c08a43" />
        </g>
        <g transform="translate(194 56)">
          <path d="M0 0h82l22 14H22z" fill="url(#beBoxTop)" />
          <rect x="22" y="14" width="82" height="42" fill="url(#beBoxFront)" />
          <path d="M0 0l22 14v42L0 42z" fill="#bd843c" />
        </g>
        <g transform="translate(34 8)">
          <path d="M0 0h78l18 12H18z" fill="url(#beBoxTop)" />
          <rect x="18" y="12" width="78" height="42" fill="url(#beBoxFront)" />
          <path d="M0 0l18 12v42L0 42z" fill="#c08a43" />
        </g>
        <g transform="translate(126 10)">
          <path d="M0 0h82l20 13H20z" fill="url(#beBoxTop)" />
          <rect x="20" y="13" width="82" height="54" fill="url(#beBoxFront)" />
          <path d="M0 0l20 13v54L0 54z" fill="#c08a43" />
        </g>
      </g>

      <g filter="url(#beTinyShadow)" transform="translate(408 374)">
        <path d="M28 96h124c10 0 18 8 18 18v8H24v-22c0-2 2-4 4-4Z" fill="#004c43" />
        <path d="M40 72h58c12 0 22 10 22 22v28H40z" fill="#0b725f" />
        <path d="M110 78h40l22 44h-62z" fill="#063f3a" />
        <rect x="6" y="58" width="12" height="74" rx="5" fill="#176a60" />
        <rect x="6" y="58" width="104" height="12" rx="5" fill="#176a60" />
        <rect x="0" y="126" width="74" height="8" rx="4" fill="#15423d" />
        <circle cx="62" cy="132" r="22" fill="#153c38" />
        <circle cx="62" cy="132" r="12" fill="#90a8a2" />
        <circle cx="134" cy="132" r="22" fill="#153c38" />
        <circle cx="134" cy="132" r="12" fill="#90a8a2" />
      </g>

      <g filter="url(#beTinyShadow)" transform="translate(612 300)">
        <rect x="0" y="0" width="8" height="190" rx="4" fill="#174f49" />
        <rect x="110" y="0" width="8" height="190" rx="4" fill="#174f49" />
        {[34, 92, 150].map((y) => (
          <rect key={y} x="0" y={y} width="118" height="10" rx="5" fill="#174f49" />
        ))}
        {[12, 70, 128].map((y) => (
          <g key={y}>
            <rect x="16" y={y} width="40" height="34" rx="3" fill="#dfad64" />
            <rect x="66" y={y + 1} width="40" height="33" rx="3" fill="#c68d43" />
          </g>
        ))}
      </g>
    </svg>
  </div>
);

const Login = () => {
  const navigate = useNavigate();
  const timersRef = useRef([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [formError, setFormError] = useState("");
  const [authStep, setAuthStep] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("be-login-theme") || "light";
  });

  const isDark = theme === "dark";
  const loadingText = useMemo(() => authStep || "Sign In", [authStep]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("be-login-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const showSocialNotice = (provider) => {
    setFormError(`${provider} sign in is ready for UI review. Connect your identity provider to enable it.`);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {
      email: email.trim() ? (validateEmail(email) ? "" : "Enter a valid email") : "Email is required",
      password: password ? "" : "Password is required",
    };

    setErrors(nextErrors);
    setFormError("");
    if (Object.values(nextErrors).some(Boolean)) return;

    setIsSubmitting(true);
    setAuthStep("Verifying...");

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [
      setTimeout(() => setAuthStep("Authenticating..."), 700),
      setTimeout(() => setAuthStep("Loading your workspace..."), 1450),
      setTimeout(() => {
        setIsSuccess(true);
        setAuthStep("Welcome back");
      }, 2150),
      setTimeout(() => setIsLeaving(true), 2800),
      setTimeout(() => navigate("/"), 3300),
    ];
  };

  return (
    <main className={`login-page ${isDark ? "dark-login" : ""} ${isLeaving ? "login-leaving" : ""}`}>
      <section className="login-left">
        <div className="mx-auto flex min-h-screen w-full max-w-[620px] flex-col justify-center px-6 py-8 sm:px-10 lg:px-12">
          <div className="mb-16 flex items-center justify-between gap-6">
            <img src={logo} alt="Bangalore Electronics" className="login-logo h-14 w-auto object-contain sm:h-16" />
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="login-theme-toggle"
              aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
              aria-pressed={isDark}
            >
              <span className="login-theme-track">
                <span className="login-theme-thumb">
                  <ThemeIcon dark={isDark} />
                </span>
              </span>
            </button>
          </div>

          <form className={`login-card ${isLeaving ? "opacity-0" : ""}`} onSubmit={handleSubmit} noValidate>
            <div className="animate-login-stagger" style={stagger(0)}>
              <h1 className="login-heading text-4xl font-extrabold tracking-normal text-[#071733] transition-colors duration-300 sm:text-[42px]">
                Welcome Back! <span aria-hidden="true">{"\u{1F44B}"}</span>
              </h1>
              <p className="login-muted mt-4 text-lg font-medium text-slate-500 transition-colors duration-300">
                Please sign in to continue to your account
              </p>
            </div>

            {formError && (
              <div className="mt-8 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 animate-login-shake" role="alert">
                {formError}
              </div>
            )}

            <div className="mt-10 space-y-7">
              <div className="animate-login-stagger" style={stagger(1)}>
                <FloatingInput
                  id="email"
                  label="Email"
                  icon={<MailIcon />}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  error={errors.email}
                />
              </div>

              <div className="animate-login-stagger" style={stagger(2)}>
                <FloatingInput
                  id="password"
                  label="Password"
                  icon={<LockIcon />}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  error={errors.password}
                  rightAction={
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="login-password-toggle absolute inset-y-0 right-5 grid place-items-center text-slate-400 transition duration-300 hover:scale-110 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      <EyeIcon hidden={showPassword} />
                    </button>
                  }
                />
              </div>

              <div className="flex animate-login-stagger items-center justify-between gap-4 text-sm sm:text-base" style={stagger(3)}>
                <label className="login-muted flex cursor-pointer items-center gap-3 font-medium text-slate-500 transition-colors duration-300">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    className="h-5 w-5 rounded-md border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  Remember me
                </label>
                <button type="button" className="login-link font-bold text-emerald-700 transition hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-4">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`login-submit group animate-login-stagger ${isSuccess ? "login-submit-success" : ""}`}
                style={stagger(4)}
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {isSuccess ? <CheckIcon /> : isSubmitting ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/90 border-t-transparent" aria-hidden="true" /> : null}
                  {loadingText}
                  {!isSubmitting && !isSuccess && <ArrowIcon className="absolute right-6 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />}
                </span>
                {isSubmitting && !isSuccess && <span className="login-progress" aria-hidden="true" />}
              </button>
            </div>

            <div className="my-10 flex animate-login-stagger items-center gap-7" style={stagger(5)} aria-hidden="true">
              <span className="login-divider h-px flex-1 bg-slate-200" />
              <span className="text-sm font-bold text-slate-400">OR</span>
              <span className="login-divider h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid animate-login-stagger grid-cols-1 gap-4 sm:grid-cols-3" style={stagger(6)}>
              {[
                ["Google", "google"],
                ["Microsoft", "microsoft"],
                ["Apple", "apple"],
              ].map(([label, type]) => (
                <button key={label} type="button" onClick={() => showSocialNotice(label)} className="login-social">
                  <SocialIcon type={type} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <p className="login-muted mt-12 animate-login-stagger text-center text-base font-medium text-slate-500 transition-colors duration-300" style={stagger(7)}>
              Don&apos;t have an account?{" "}
              <Link to="/create-account" className="login-link font-extrabold text-emerald-700 transition hover:text-emerald-600">
                Sign Up
              </Link>
            </p>
          </form>
        </div>
      </section>

      <section className="login-right" aria-label="Inventory Management overview">
        <div className="login-pattern" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-[760px] flex-col justify-center px-8 py-14 lg:px-16">
          <div className="mb-6 animate-login-panel-copy text-white">
            <h2 className="text-3xl font-extrabold tracking-normal sm:text-4xl">Inventory Management</h2>
            <p className="mt-5 max-w-[560px] text-lg leading-8 text-white/78">
              Join our platform to streamline your inventory processes, reduce costs, and enhance productivity.
            </p>
          </div>
          <DashboardIllustration />
        </div>
      </section>
    </main>
  );
};

export default Login;
