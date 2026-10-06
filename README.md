# BE Inventory Management System

React and Express application covering inventory, procurement, HRMS, project management, tools, invoicing, and reporting. SQL Server is the system of record.

## Requirements

- Node.js 22+
- SQL Server reachable from the API host
- A modern browser with WebAuthn support for passkeys

## Local setup

1. Copy `.env.example` to `.env`.
2. Copy `backend/.env.example` to `backend/.env` and provide database credentials.
3. Create a development administrator through the documented seed environment values. Set `AUTH_DISABLED=false` to require normal login; see the temporary bypass section below.
4. Install dependencies with `npm ci`.
5. Apply schema changes with `npm run db:migrate`.
6. Start both services with `npm run dev:all`.

The frontend runs on `http://localhost:5173`; Vite proxies `/api` to the API on port 5000. Check `GET /api/health` for readiness.

## Temporary Login Bypass

Login is temporarily disabled by default. The backend `AUTH_DISABLED` switch is
also read by the frontend through `/api/auth/mode`, so login and account-entry
URLs redirect to the dashboard without a separate frontend setting or rebuild.
The backend uses an active database user (preferring `SUPER_ADMIN_EMAIL`, then
`ADMIN_EMAIL`, then an administrator), preserving valid user IDs for profile,
ownership, audit, and foreign-key references. Existing role permissions remain
in effect. MFA enrollment, session cookies, CSRF tokens, and step-up prompts are
not required for this temporary access. Logout is hidden while bypassed.

Set `AUTH_DISABLED=false` in `backend/.env` and restart the backend to restore
normal login, session, CSRF, and MFA checks. Existing login code, passwords,
passkeys, and accounts are retained. While bypassed, anyone who can reach the
app has the selected user's access, including in production. The database must
be available and contain an active account.

## Verification

```text
npm run lint
npm test
npm run build
```

`npm run ci` runs all three checks. Browser checks are available through `npm run test:ui` and `npm run test:ui:routes` while the Vite server is running.

## Database migrations

SQL migrations live in `backend/migrations` and are applied in filename order. `npm run db:migrate` records successful migrations in `dbo.SchemaMigrations` and wraps each migration in a transaction. Apply migrations before starting a new production version. The production database identity should not have general schema-alter permissions during normal API operation.

For an existing installation created by the legacy runtime schema initializer, the first migration run records migrations 001–011 as the baseline and applies newer migrations. Production startup verifies the schema and never performs runtime DDL.

Back up both inventory and HRMS databases before applying migrations. Test restore procedures regularly; an untested backup is not considered verified.

## Production

Build and run the container with environment values supplied by your secret manager:

```text
docker build -t be-inventory .
docker run --env-file /secure/path/inventory.env -p 5000:5000 be-inventory
```

The production Express server serves both the built frontend and `/api`. Set `NODE_ENV=production`, HTTPS public/WebAuthn origins, SMTP configuration, encryption keys, trusted proxy hops, and secure database settings. Never bake `.env` files into the image.

Operational requirements:

- Terminate TLS at the load balancer or reverse proxy.
- Restrict SQL Server network access to API hosts.
- Send application logs to centralized storage with retention and alerting.
- Monitor `/api/health`, HTTP 5xx rate, authentication failures, database latency, and storage capacity.
- Rotate seed passwords immediately after initial provisioning.

## Access control

With `AUTH_DISABLED=false`, public endpoints are limited to authentication flows and `/api/health`. Every other API requires an enrolled session and a module permission. During the temporary bypass, API requests use the selected active database user and retain module permission checks. UI route guards are a user-experience feature; backend permission checks are authoritative.

## Repository layout

- `src/` — React application
- `backend/src/` — API, authentication, module routers and services
- `backend/migrations/` — ordered SQL migrations
- `backend/tests/` — Node test suite
- `scripts/` — build and browser-audit utilities

The legacy `inventory-api` directory is not part of the supported runtime and must not be used for deployments.
