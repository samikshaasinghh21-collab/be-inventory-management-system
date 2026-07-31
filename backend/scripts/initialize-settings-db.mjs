import dotenv from "dotenv";
import { ensureAuthSchema } from "../src/auth.js";
import { getPool, sql } from "../src/config/db.js";

dotenv.config({ path: "backend/.env" });
dotenv.config({ path: "../backend/.env" });

const defaults = {
  organization: {
    name: "BE Inventory",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
  },
  inventory: {
    defaultUnit: "PCS",
    lowStockThreshold: 5,
    reorderLevel: 10,
    valuationMethod: "FIFO",
    allowNegativeStock: false,
    autoReorder: false,
    trackBatch: false,
  },
  security: {
    inactivityTimeoutMinutes: 30,
    passwordExpiryDays: 90,
    failedLoginLimit: 5,
    accountLockMinutes: 15,
    requireStrongPassword: true,
  },
};

await ensureAuthSchema();
const pool = await getPool();

for (const [key, value] of Object.entries(defaults)) {
  await pool
    .request()
    .input("Key", sql.NVarChar(80), key)
    .input("Value", sql.NVarChar(sql.MAX), JSON.stringify(value))
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.WorkspaceSettings WHERE SettingKey = @Key
      )
        INSERT dbo.WorkspaceSettings (SettingKey, SettingJson)
        VALUES (@Key, @Value);
    `);
}

const verification = await pool.request().query(`
  SELECT name
  FROM sys.tables
  WHERE name IN (
    'AppUsers', 'UserPreferences', 'WorkspaceSettings', 'AppSessions',
    'AuthTokens', 'TotpRecoveryCodes', 'LoginHistory', 'AuditEvents'
  )
  ORDER BY name;

  SELECT SettingKey
  FROM dbo.WorkspaceSettings
  ORDER BY SettingKey;

  SELECT COUNT(*) AS UserCount
  FROM dbo.AppUsers;
`);

console.log(JSON.stringify({
  tables: verification.recordsets[0].map((row) => row.name),
  settings: verification.recordsets[1].map((row) => row.SettingKey),
  userCount: Number(verification.recordsets[2][0].UserCount),
}, null, 2));

await pool.close();
