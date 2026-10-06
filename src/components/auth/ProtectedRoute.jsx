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
        setState({ status: isApiUnavailableError(error) ? "unavailable" : "anonymous", user: null });
      }
    };
    void checkSession();
    return () => { active = false; };
  }, []);

  if (state.status === "loading") {
    return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600" role="status">Checking your session…</div>;
  }
  if (state.status === "unavailable") {
    return <div className="min-h-screen bg-slate-50 p-8 text-sm text-red-700" role="alert">The application service is unavailable. Please try again shortly.</div>;
  }
  if (!state.user) {
    return <Navigate replace to="/login" state={{ from: location }} />;
  }
  return <Outlet />;
};

export default ProtectedRoute;

