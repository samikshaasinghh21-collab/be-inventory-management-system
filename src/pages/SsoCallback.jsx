import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SsoCallback = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate("/login", { replace: true }); }, [navigate]);
  return <div className="grid min-h-screen place-items-center text-sm text-slate-500">SSO must be configured by an administrator.</div>;
};
export default SsoCallback;
