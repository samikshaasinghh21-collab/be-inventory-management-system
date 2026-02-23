# Backend Setup

1. Copy `.env.example` to `.env`.
2. Fill in `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
3. Start backend: `npm run server`
4. Verify health: `http://localhost:5000/api/health`

If DB credentials are valid, `/api/health` returns `db: "connected"`.

