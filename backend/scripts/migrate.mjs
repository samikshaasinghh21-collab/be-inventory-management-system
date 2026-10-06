import dotenv from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, sql } from "../src/config/db.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
dotenv.config({ path: path.join(backendDir, ".env") });

const pool = await getPool();
const state = await pool.request().query(`
  SELECT
    CASE WHEN OBJECT_ID('dbo.SchemaMigrations','U') IS NULL THEN 0 ELSE 1 END AS HadLedger,
    CASE WHEN OBJECT_ID('dbo.Items','U') IS NULL THEN 0 ELSE 1 END AS HasLegacyCore
`);
await pool.request().query(`
  IF OBJECT_ID('dbo.SchemaMigrations','U') IS NULL
    CREATE TABLE dbo.SchemaMigrations(
      MigrationName NVARCHAR(255) NOT NULL PRIMARY KEY,
      AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
`);

const files = (await readdir(path.join(backendDir, "migrations")))
  .filter((name) => /^\d+.*\.sql$/i.test(name))
  .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));

if (!state.recordset[0].HadLedger && state.recordset[0].HasLegacyCore) {
  for (const file of files.filter((name) => Number.parseInt(name, 10) <= 11)) {
    await pool.request().input("Name", sql.NVarChar(255), file)
      .query("INSERT dbo.SchemaMigrations(MigrationName) VALUES(@Name)");
  }
  console.log("Baselined legacy schema through migration 011.");
}

const appliedResult = await pool.request().query("SELECT MigrationName FROM dbo.SchemaMigrations");
const applied = new Set(appliedResult.recordset.map((row) => row.MigrationName));

for (const file of files) {
  if (applied.has(file)) continue;
  const sqlText = await readFile(path.join(backendDir, "migrations", file), "utf8");
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    await new sql.Request(transaction).batch(sqlText);
    await new sql.Request(transaction)
      .input("Name", sql.NVarChar(255), file)
      .query("INSERT dbo.SchemaMigrations(MigrationName) VALUES(@Name)");
    await transaction.commit();
    console.log(`Applied ${file}`);
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
  }
}

console.log("Database migrations are current.");
await pool.close();
