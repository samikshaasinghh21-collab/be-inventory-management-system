import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../../services/api";

export default function AuthEntry({ children }) {
  const [disabled, setDisabled] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/auth/mode").then(({ data }) => {
      if (active) setDisabled(data.authenticationDisabled === true);
    }).catch(() => {
      if (active) setError("Unable to connect to the server.");
    });
    return () => { active = false; };
  }, []);

  if (error) return <div role="alert">{error} <button type="button" onClick={() => window.location.reload()}>Retry</button></div>;
  if (disabled === null) return <div role="status">Loading...</div>;
  return disabled ? <Navigate to="/" replace /> : children;
}
