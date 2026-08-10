const normalizeOrigin = (origin) => {
  if (!origin) return "";
  try {
    return origin.replace(/\/+$/, "");
  } catch {
    return String(origin).replace(/\/+$/, "");
  }
};

const isLoopbackOrigin = (origin) => {
  try {
    const { protocol, hostname } = new URL(origin);
    return (
      (protocol === "http:" || protocol === "https:") &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
    );
  } catch {
    return false;
  }
};

export const buildAllowedOrigins = (envValue = "") => {
  const configuredOrigins = String(envValue || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const developmentOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
  ];

  return new Set(configuredOrigins.length ? configuredOrigins : developmentOrigins);
};

export const isAllowedOrigin = (origin, envValue = "") => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true;
  if (isLoopbackOrigin(normalizedOrigin)) {
    return true;
  }
  return buildAllowedOrigins(envValue).has(normalizedOrigin);
};
