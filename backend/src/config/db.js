import sql from "mssql";
import dotenv from "dotenv";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadEnv = (envPath) => {
  dotenv.config({ path: envPath });
};

// Prefer the backend/.env in this repo, but also allow the sibling backend/.env
// (C:\Users\adars\inventory-management-system\backend\.env) if that's what is edited.
loadEnv(path.resolve(__dirname, "../../.env"));
loadEnv(path.resolve(__dirname, "../../../../backend/.env"));

const getEnv = (primary, fallback) =>
  process.env[primary] ?? process.env[fallback];

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value, fallback) => {
  if (value == null) {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
};

const dbServer = getEnv("DB_HOST", "DB_SERVER")?.trim();
const dbEncrypt = toBool(process.env.DB_ENCRYPT, false);
const dbTrustServerCertificate = toBool(
  process.env.DB_TRUST_SERVER_CERTIFICATE,
  true,
);
const configuredTlsServerName = getEnv(
  "DB_TLS_SERVER_NAME",
  "DB_SERVER_NAME",
)?.trim();
const dbServerIsIp = typeof dbServer === "string" && net.isIP(dbServer) !== 0;
// Tedious passes the server address as TLS SNI during encrypted prelogin.
// Node warns on IP-based SNI, so use a DNS-style fallback for trusted certs.
const tlsServerName =
  configuredTlsServerName ||
  (dbEncrypt && dbTrustServerCertificate && dbServerIsIp
    ? "localhost"
    : undefined);

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: dbServer,
  port: toInt(process.env.DB_PORT, 1433),
  database: getEnv("DB_NAME", "DB_DATABASE"),
  connectionTimeout: toInt(process.env.DB_CONNECTION_TIMEOUT_MS, 30000),
  requestTimeout: toInt(process.env.DB_REQUEST_TIMEOUT_MS, 120000),
  options: {
    encrypt: dbEncrypt,
    trustServerCertificate: dbTrustServerCertificate,
    ...(tlsServerName ? { serverName: tlsServerName } : {}),
  },
  pool: {
    max: toInt(process.env.DB_POOL_MAX, 10),
    min: toInt(process.env.DB_POOL_MIN, 0),
    idleTimeoutMillis: toInt(process.env.DB_POOL_IDLE_MS, 30000),
  },
};

let poolPromise;

export const getPool = async () => {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }
  return poolPromise;
};

export const checkDbConnection = async () => {
  const pool = await getPool();
  await pool.request().query("SELECT 1 AS ok");
  return true;
};

export { sql, dbConfig };
