const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const paginatePayload = (payload, page, pageSize) => {
  const arrayEntry = Array.isArray(payload)
    ? [null, payload]
    : Object.entries(payload || {}).find(([, value]) => Array.isArray(value));
  if (!arrayEntry) return payload;
  const [key, rows] = arrayEntry;
  const start = (page - 1) * pageSize;
  const pagination = {
    page,
    pageSize,
    total: rows.length,
    pages: Math.max(1, Math.ceil(rows.length / pageSize)),
  };
  const sliced = rows.slice(start, start + pageSize);
  return key === null ? { items: sliced, pagination } : { ...payload, [key]: sliced, pagination };
};

export const optionalPagination = (req, res, next) => {
  if (req.method !== "GET" || (!req.query.page && !req.query.pageSize && !req.query.limit)) return next();
  const page = positiveInteger(req.query.page, 1);
  const pageSize = Math.min(positiveInteger(req.query.pageSize ?? req.query.limit, 50), 200);
  const sendJson = res.json.bind(res);
  res.json = (payload) => sendJson(paginatePayload(payload, page, pageSize));
  return next();
};

