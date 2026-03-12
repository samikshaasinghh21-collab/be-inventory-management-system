import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const SsoCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token =
    searchParams.get("token") ||
    searchParams.get("access_token") ||
    searchParams.get("id_token");
  const code = searchParams.get("code");
  const status = token
    ? "Signed in via SSO. Redirecting to dashboard..."
    : code
    ? "SSO code received. Redirecting to dashboard..."
    : "";
  const error = !token && !code ? "SSO response did not include a token or code." : "";

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      const timer = setTimeout(() => navigate("/"), 300);
      return () => clearTimeout(timer);
    }

    if (code) {
      // In a real app, exchange the code on the backend. For now, just park it and proceed.
      localStorage.setItem("sso_code", code);
      const timer = setTimeout(() => navigate("/"), 300);
      return () => clearTimeout(timer);
    }
  }, [navigate, token, code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl space-y-4 text-center">
        <p className="text-xl font-semibold">Signing you in...</p>
        {status && <p className="text-slate-300">{status}</p>}
        {error && <p className="text-rose-300">{error}</p>}
        <div className="flex justify-center">
          <span className="h-10 w-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" aria-hidden />
        </div>
      </div>
    </div>
  );
};

export default SsoCallback;
