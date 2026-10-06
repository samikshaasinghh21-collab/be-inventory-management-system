const INTERNAL_MESSAGE = "Internal server error";

export const sanitizeErrorPayload = (statusCode, payload, isProduction) => {
  if (!isProduction || Number(statusCode) < 500 || !payload || typeof payload !== "object") {
    return payload;
  }
  return {
    ...payload,
    code: payload.code || "INTERNAL_ERROR",
    error: INTERNAL_MESSAGE,
    ...(Object.hasOwn(payload, "message") ? { message: INTERNAL_MESSAGE } : {}),
  };
};

export const sanitizeErrorResponses = (isProduction) => (_req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (payload) => sendJson(sanitizeErrorPayload(res.statusCode, payload, isProduction));
  next();
};

