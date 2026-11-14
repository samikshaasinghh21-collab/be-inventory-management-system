import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getCurrentUser, loadCurrentUser } from "../../services/authService";
import { isApiUnavailableError } from "../../services/api";

const ProtectedRoute = () => {
  const location = useLocation();
  const [state, setState] = useState(() => ({
    status: getCurrentUser() ? "authenticated" : "loading",
    user: getCurrentUser(),
  }));

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const user = getCurrentUser() || await loadCurrentUser();
        if (active) setState({ status: user ? "authenticated" : "anonymous", user });
      } catch (error) {
        if (!active) return;
        // Only an explicit authentication rejection should send users to login.
        // Server/database failures otherwise loop when AuthEntry redirects back
        // here in password-free mode.
        const unavailable = isApiUnavailableError(error) || !error?.response || error.response.status >= 500;
        setState({ status: unavailable ? "unavailable" : "anonymous", user: null });
      }
    };
    void checkSession();
    return () => { active = false; };
  }, []);

  if (state.status === "loading") {
    return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600" role="status">Checking your session…</div>;
  }
  if (state.status === "unavailable") {
    return (
      <>
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900" role="status">
          Offline preview: you can browse the interface. Live data and server saves are unavailable until the server reconnects.
          <button type="button" className="ml-3 font-semibold underline" onClick={() => window.location.reload()}>Retry connection</button>
        </div>
        <Outlet context={{ offlinePreview: true }} />
      </>
    );
  }
  if (!state.user) {
    return <Navigate replace to="/login" state={{ from: location }} />;
  }
  return <Outlet />;
};

export default ProtectedRoute;

