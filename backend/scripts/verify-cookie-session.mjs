import dotenv from "dotenv";

dotenv.config({ path: "backend/.env" });
dotenv.config({ path: "../backend/.env" });

const email = process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || process.env.MANAGER_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || process.env.MANAGER_PASSWORD;
if (!email || !password) {
  console.log("Opaque-session integration skipped: no one-time seed credentials are configured.");
  process.exit(0);
}

const origin = process.env.WEBAUTHN_ORIGIN || "http://localhost:5173";
const login = await fetch("http://localhost:5000/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email, password }),
});
const loginBody = await login.json();
if (![200, 202].includes(login.status)) throw new Error(`Login returned ${login.status}`);

const setCookies = login.headers.getSetCookie();
const cookiePairs = setCookies.map((value) => value.split(";")[0]);
const cookies = cookiePairs.join("; ");
if (cookiePairs.some((value) => /^be_(access|refresh)=/.test(value))) {
  throw new Error("A removed JWT/refresh cookie was issued");
}

if (loginBody.code === "MFA_REQUIRED") {
  if (cookiePairs.some((value) => /^(be_session|__Host-be_session)=/.test(value))) {
    throw new Error("A session was issued before MFA verification");
  }
  console.log("Password verification returned MFA_REQUIRED and did not issue a session.");
  process.exit(0);
}

if (!cookiePairs.some((value) => /^(be_session|__Host-be_session)=/.test(value))) {
  throw new Error("Opaque session cookie is missing");
}
if (!cookiePairs.some((value) => value.startsWith("be_csrf="))) {
  throw new Error("CSRF cookie is missing");
}

const session = await fetch("http://localhost:5000/api/auth/session", {
  headers: { cookie: cookies, origin },
});
if (!session.ok) throw new Error(`Authenticated session request returned ${session.status}`);
const sessionBody = await session.json();

const settings = await fetch("http://localhost:5000/api/settings/profile", {
  headers: { cookie: cookies, origin },
});
if (sessionBody.user?.enrollmentRequired && settings.status !== 403) {
  throw new Error("Enrollment-only session was allowed to access Settings");
}
if (!sessionBody.user?.enrollmentRequired && !settings.ok) {
  throw new Error(`Settings profile returned ${settings.status}`);
}

const csrf = decodeURIComponent(cookiePairs.find((value) => value.startsWith("be_csrf=")).slice(8));
const logout = await fetch("http://localhost:5000/api/auth/logout", {
  method: "POST",
  headers: { cookie: cookies, origin, "x-csrf-token": csrf },
});
if (!logout.ok) throw new Error(`CSRF-protected logout returned ${logout.status}`);

console.log(JSON.stringify({
  opaqueSessionVerified: true,
  enrollmentRequired: Boolean(sessionBody.user?.enrollmentRequired),
  legacyCookiesIssued: false,
  csrfLogoutVerified: true,
}));
