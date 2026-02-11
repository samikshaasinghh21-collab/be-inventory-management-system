import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: toInt(process.env.DB_PORT, 1433),
  database: process.env.DB_NAME,
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
