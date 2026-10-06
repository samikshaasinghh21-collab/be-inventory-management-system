import express from "express";
import { z } from "zod";
import { getPool, sql } from "./config/db.js";

const keySchema = z.string().regex(/^[a-z][a-z0-9-]{0,99}$/);
const MAX_JSON_BYTES = 1_000_000;

export const createWorkspaceDataRouter = () => {
  const router = express.Router();

  router.get("/:key", async (req, res, next) => {
    try {
      const parsed = keySchema.safeParse(req.params.key);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid workspace data key" });
      const result = await (await getPool()).request()
        .input("Key", sql.NVarChar(100), parsed.data)
        .query("SELECT DataJson,UpdatedAt FROM dbo.WorkspaceData WHERE DataKey=@Key");
      const row = result.recordset[0];
      return res.json({ ok: true, value: row ? JSON.parse(row.DataJson) : null, updatedAt: row?.UpdatedAt ?? null });
    } catch (error) { return next(error); }
  });

  router.put("/:key", async (req, res, next) => {
    try {
      const parsed = keySchema.safeParse(req.params.key);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", error: "Invalid workspace data key" });
      const serialized = JSON.stringify(req.body?.value ?? null);
      if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) {
        return res.status(413).json({ ok: false, code: "PAYLOAD_TOO_LARGE", error: "Workspace data exceeds 1 MB" });
      }
      await (await getPool()).request()
        .input("Key", sql.NVarChar(100), parsed.data)
        .input("Json", sql.NVarChar(sql.MAX), serialized)
        .input("UserId", sql.Int, req.user.id)
        .query(`
          MERGE dbo.WorkspaceData WITH (HOLDLOCK) AS target
          USING (SELECT @Key AS DataKey) AS source ON target.DataKey=source.DataKey
          WHEN MATCHED THEN UPDATE SET DataJson=@Json,UpdatedBy=@UserId,UpdatedAt=SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT(DataKey,DataJson,UpdatedBy) VALUES(@Key,@Json,@UserId);
        `);
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  return router;
};

