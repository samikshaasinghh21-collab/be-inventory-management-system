import { hasPermission } from "./auth.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const POLICIES = [
  { prefix: "/finance", read: ["finance.view"], write: ["finance.manage"] },
  { prefix: "/hrms", read: ["hrms.view"], write: ["hrms.manage"] },
  { prefix: "/invoices", read: ["finance.view"], write: ["finance.manage"] },
  { prefix: "/purchase-orders", read: ["procurement.view"], write: ["procurement.manage"] },
  { prefix: "/receive-goods", read: ["procurement.view", "inventory.view"], write: ["procurement.manage", "inventory.manage"] },
  { prefix: "/goods-receipts", read: ["procurement.view", "inventory.view"], write: ["procurement.manage", "inventory.manage"] },
  { prefix: "/vendors", read: ["procurement.view"], write: ["procurement.manage"] },
  { prefix: "/db-test", read: ["workspace.manage"], write: ["workspace.manage"] },
  {
    prefix: "/",
    read: ["inventory.view"],
    write: ["inventory.manage"],
  },
];

export const permissionsForApiRequest = (method, path) => {
  const policy = POLICIES.find(({ prefix }) => prefix === "/" || path === prefix || path.startsWith(`${prefix}/`));
  return READ_METHODS.has(String(method).toUpperCase()) ? policy.read : policy.write;
};

export const authorizeApiRequest = (req, res, next) => {
  const required = permissionsForApiRequest(req.method, req.path);
  if (!required.some((permission) => hasPermission(req.user, permission))) {
    return res.status(403).json({
      ok: false,
      code: "FORBIDDEN",
      error: "You do not have permission to perform this operation",
    });
  }
  return next();
};

