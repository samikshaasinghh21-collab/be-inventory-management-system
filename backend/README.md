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

## Authentication and security administration

Set these values before starting the server:

```env
TOTP_ENCRYPTION_KEY=replace-with-a-long-random-encryption-secret
TRUSTED_FRONTEND_ORIGIN=https://inventory.example.com
APP_PUBLIC_URL=https://inventory.example.com
WEBAUTHN_ORIGIN=https://inventory.example.com
WEBAUTHN_RP_ID=inventory.example.com
WEBAUTHN_RP_NAME=Bangalore Electronics
TRUST_PROXY_HOPS=1
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FROM=no-reply@example.com
SUPER_ADMIN_EMAIL=owner@example.com
SUPER_ADMIN_PASSWORD=replace-with-a-strong-initial-password
MANAGER_NAME=Project Manager
MANAGER_EMAIL=manager@example.com
MANAGER_PASSWORD=replace-with-a-strong-initial-password
```

Production startup fails if the TOTP encryption, SMTP, public URL, trusted
origin, or WebAuthn values are absent, or if the public URL is not HTTPS. Public
registration is disabled. Configure an initial Super Admin, then invite other
users from Settings.

Authentication uses one 256-bit opaque session cookie. Only its SHA-256 hash is
stored in SQL Server. The production cookie is named `__Host-be_session` and is
`HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to `/`. Sessions expire after
seven days or 30 minutes of inactivity. There is no refresh-token endpoint.
State-changing authenticated requests require the CSRF cookie value in the
`X-CSRF-Token` header and are additionally checked against the configured
Origin and Fetch Metadata.

Passkeys and TOTP are available as optional account protections in Settings.
Accounts without TOTP can sign in with their password. Once TOTP is enabled,
password sign-in also requires TOTP or a recovery code. Existing bcrypt hashes
are upgraded to Argon2id after a successful password check.

The configured seed accounts are created or refreshed during schema warmup.
Remove their plaintext deployment passwords after initial provisioning if your
deployment system supports one-time secrets.

Project-management tables are created by
`migrations/004-project-management.sql`; runtime warmup applies the same
idempotent migration automatically.

Settings, sessions, users, invitations, TOTP recovery codes, login history, and
audit tables are defined in `migrations/005-settings-security.sql` and are also
created idempotently by schema warmup. Passkeys, one-use challenges, and opaque
session fields are defined in `migrations/006-passkeys-opaque-sessions.sql`.
Run `node backend/scripts/initialize-settings-db.mjs` once for an existing
database, then remove all seed password values from deployment configuration.

