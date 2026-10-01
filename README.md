# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

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
