import { getPool } from "../backend/src/config/db.js";

const toIdentifier = (name) => `[${String(name).replace(/]/g, "]]")}]`;
const HRMS_DATABASE_NAME =
  String(process.env.HRMS_DB_NAME || process.env.HRMS_DB_DATABASE || "").trim() ||
  "HRMS_DB";
const escapeSqlLiteral = (value) => String(value).replace(/'/g, "''");
const toQualifiedTable = (databaseName, tableName) =>
  `${toIdentifier(databaseName)}.${toIdentifier("dbo")}.${toIdentifier(tableName)}`;
const toObjectNameLiteral = (databaseName, tableName) =>
  escapeSqlLiteral(`${databaseName}.dbo.${tableName}`);
const hrmsTable = (tableName) => toQualifiedTable(HRMS_DATABASE_NAME, tableName);
const hrmsObjectName = (tableName) =>
  toObjectNameLiteral(HRMS_DATABASE_NAME, tableName);

const main = async () => {
  const pool = await getPool();
  const tx = pool.transaction();

  try {
    await tx.begin();

    await tx.request().batch(`
      IF DB_ID(N'${escapeSqlLiteral(HRMS_DATABASE_NAME)}') IS NULL
      BEGIN
        THROW 51000, 'HRMS database ${escapeSqlLiteral(
          HRMS_DATABASE_NAME
        )} was not found on this SQL Server.', 1;
      END

      IF OBJECT_ID(N'${hrmsObjectName("Reviews")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Reviews")};

      IF OBJECT_ID(N'${hrmsObjectName("SalaryReassessments")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("SalaryReassessments")};

      IF OBJECT_ID(N'${hrmsObjectName("Attendance")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Attendance")};

      IF OBJECT_ID(N'${hrmsObjectName("Salaries")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Salaries")};

      IF OBJECT_ID(N'${hrmsObjectName("Relieving")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Relieving")};

      IF OBJECT_ID(N'${hrmsObjectName("Employees")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Employees")};

      IF OBJECT_ID(N'${hrmsObjectName("Departments")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Departments")};

      IF OBJECT_ID(N'${hrmsObjectName("Designations")}', N'U') IS NOT NULL
        DELETE FROM ${hrmsTable("Designations")};

      IF OBJECT_ID(N'${hrmsObjectName("EmployeeIdSequences")}', N'U') IS NOT NULL
      BEGIN
        IF EXISTS (SELECT 1 FROM ${hrmsTable("EmployeeIdSequences")} WHERE Prefix = 'BE')
        BEGIN
          UPDATE ${hrmsTable("EmployeeIdSequences")}
          SET LastNumber = 0, UpdatedAt = GETDATE()
          WHERE Prefix = 'BE';
        END
        ELSE
        BEGIN
          INSERT INTO ${hrmsTable("EmployeeIdSequences")} (Prefix, LastNumber, UpdatedAt)
          VALUES ('BE', 0, GETDATE());
        END
      END
    `);

    await tx.commit();
    console.log(`HRMS data reset completed for database ${HRMS_DATABASE_NAME}.`);
  } catch (error) {
    await tx.rollback();
    console.error("Failed to reset HRMS data.");
    console.error(error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.close();
  }
};

await main();
