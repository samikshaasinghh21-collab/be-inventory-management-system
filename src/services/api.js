import axios from "axios";

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();
const DEFAULT_API_BASE_URL = "/api";
const API_BASE_URL = CONFIGURED_API_BASE_URL || DEFAULT_API_BASE_URL;
const API_AVAILABILITY_TTL_MS = 15_000;
const API_UNAVAILABLE_CODE = "API_UNAVAILABLE";
const DB_UNAVAILABLE_CODE = "DB_UNAVAILABLE";
const API_UNAVAILABLE_CODES = new Set([API_UNAVAILABLE_CODE, DB_UNAVAILABLE_CODE]);
const API_UNAVAILABLE_MESSAGE =
  "Inventory API is unavailable. Start the backend server and verify the SQL Server connection.";

const normalizeApiBaseUrl = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  return trimmed.replace(/\/+$/, "") || DEFAULT_API_BASE_URL;
};

const canUseSameOriginFallback = () => {
  if (!CONFIGURED_API_BASE_URL || typeof window === "undefined") {
    return false;
  }

  try {
    const currentOrigin = window.location.origin;
    const configuredOrigin = new URL(CONFIGURED_API_BASE_URL, currentOrigin).origin;
    return configuredOrigin !== currentOrigin;
  } catch {
    return false;
  }
};

const resolveApiUrls = (baseUrl) => {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  return {
    baseUrl: normalizedBaseUrl,
    healthUrl: `${normalizedBaseUrl}/health`,
  };
};

let activeApiBaseUrl = normalizeApiBaseUrl(API_BASE_URL);

const buildApiUnavailableError = (
  message = API_UNAVAILABLE_MESSAGE,
  code = API_UNAVAILABLE_CODE
) => {
  const error = new Error(message);
  error.name = "ApiUnavailableError";
  error.code = "ERR_API_UNAVAILABLE";
  error.isApiUnavailable = true;
  error.response = {
    status: 503,
    data: {
      ok: false,
      code,
      error: message,
    },
  };
  return error;
};

export const isApiUnavailableError = (error) =>
  Boolean(error?.isApiUnavailable) ||
  error?.code === "ERR_API_UNAVAILABLE" ||
  API_UNAVAILABLE_CODES.has(error?.response?.data?.code);

const normalizeApiUnavailableError = (error) => {
  if (isApiUnavailableError(error)) {
    return error;
  }

  const responseCode = error?.response?.data?.code;
  const responseMessage = error?.response?.data?.error;

  if (API_UNAVAILABLE_CODES.has(responseCode)) {
    return buildApiUnavailableError(responseMessage, responseCode);
  }

  if (error?.response?.data?.db === "disconnected") {
    return buildApiUnavailableError(responseMessage, DB_UNAVAILABLE_CODE);
  }

  return buildApiUnavailableError();
};

let apiAvailabilityCheckedAt = 0;
let apiAvailabilityError = null;
let apiAvailabilityPending = null;
let apiAvailabilityOk = null;

const markApiAvailable = () => {
  apiAvailabilityCheckedAt = Date.now();
  apiAvailabilityError = null;
  apiAvailabilityOk = true;
};

const markApiUnavailable = (error) => {
  const normalizedError = normalizeApiUnavailableError(error);
  apiAvailabilityCheckedAt = Date.now();
  apiAvailabilityError = normalizedError;
  apiAvailabilityOk = false;
  return normalizedError;
};

export const resetApiAvailability = () => {
  apiAvailabilityCheckedAt = 0;
  apiAvailabilityError = null;
  apiAvailabilityPending = null;
  apiAvailabilityOk = null;
  activeApiBaseUrl = normalizeApiBaseUrl(API_BASE_URL);
};

export const ensureApiAvailable = async ({ force = false } = {}) => {
  const now = Date.now();
  const isFresh = now - apiAvailabilityCheckedAt < API_AVAILABILITY_TTL_MS;

  if (!force) {
    if (apiAvailabilityPending) {
      return apiAvailabilityPending;
    }

    if (isFresh && apiAvailabilityOk) {
      return true;
    }

    if (isFresh && apiAvailabilityOk === false && apiAvailabilityError) {
      throw apiAvailabilityError;
    }
  }

  apiAvailabilityPending = (async () => {
    const tryHealthCheck = async (baseUrl) => {
      const { baseUrl: normalizedBaseUrl, healthUrl } = resolveApiUrls(baseUrl);
      const response = await axios.get(healthUrl, {
        timeout: 5000,
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (response?.data?.ok === false || response?.data?.db !== "connected") {
        throw buildApiUnavailableError(
          response?.data?.error,
          response?.data?.code ?? DB_UNAVAILABLE_CODE
        );
      }

      activeApiBaseUrl = normalizedBaseUrl;
      return true;
    };

    try {
      await tryHealthCheck(activeApiBaseUrl);
      markApiAvailable();
      return true;
    } catch (error) {
      const shouldFallback =
        canUseSameOriginFallback() &&
        activeApiBaseUrl !== DEFAULT_API_BASE_URL &&
        !error?.response;
      if (shouldFallback) {
        try {
          await tryHealthCheck(DEFAULT_API_BASE_URL);
          markApiAvailable();
          return true;
        } catch (fallbackError) {
          throw markApiUnavailable(fallbackError);
        }
      }
      throw markApiUnavailable(error);
    } finally {
      apiAvailabilityPending = null;
    }
  })();

  return apiAvailabilityPending;
};

const api = axios.create({
  baseURL: activeApiBaseUrl,
});

api.interceptors.request.use(
  async (config) => {
    if (!config.skipApiHealthCheck) {
      await ensureApiAvailable();
    }

    config.baseURL = activeApiBaseUrl;
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
    }

    if (
      error?.response?.status === 503 &&
      API_UNAVAILABLE_CODES.has(error?.response?.data?.code)
    ) {
      return Promise.reject(markApiUnavailable(error));
    }

    return Promise.reject(error);
  }
);

export default api;

