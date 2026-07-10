# Backend Setup

1. Copy `.env.example` to `.env`.
2. Fill in `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
3. If HRMS data lives in a separate SQL Server database, set `HRMS_DB_NAME` as well.
4. Example:

```env
PORT=5000
DB_HOST=192.168.1.199
DB_PORT=1433
DB_NAME=InventoryDB
HRMS_DB_NAME=HRMS_DB
DB_USER=sa
DB_PASSWORD=your-password
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
```
5. Start backend: `npm run server`
6. Verify health: `http://localhost:5000/api/health`

If DB credentials are valid, `/api/health` returns `db: "connected"`.

