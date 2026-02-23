import sql from "mssql";
import dotenv from "dotenv";
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

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: getEnv("DB_HOST", "DB_SERVER"),
  port: toInt(process.env.DB_PORT, 1433),
  database: getEnv("DB_NAME", "DB_DATABASE"),
  options: {
    encrypt: String(process.env.DB_ENCRYPT ?? "false").toLowerCase() === "true",
    trustServerCertificate:
      String(process.env.DB_TRUST_SERVER_CERTIFICATE ?? "true").toLowerCase() === "true",
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
