#!/usr/bin/env node
/**
 * Read-only POS cashier staging acceptance probe.
 * The only POSTs are authentication and logout; no cash/stock/sale writes.
 * Credentials must come from the environment, never process arguments.
 *
 * Required: POS_UAT_API_BASE_URL (ends in /api/v1; staging/loopback only),
 * POS_UAT_CASHIER_EMAIL, POS_UAT_CASHIER_PASSWORD,
 * POS_UAT_ALLOWED_LOCATION_ID, POS_UAT_DENIED_SESSION_ID.
 */
const env = process.env;
const required = [
  "POS_UAT_API_BASE_URL", "POS_UAT_CASHIER_EMAIL",
  "POS_UAT_CASHIER_PASSWORD", "POS_UAT_ALLOWED_LOCATION_ID",
  "POS_UAT_DENIED_SESSION_ID",
];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function main() {
  for (const key of required) assert(Boolean(env[key]?.trim()), `Missing ${key}.`);
  const baseUrl = new URL(env.POS_UAT_API_BASE_URL);
  const host = baseUrl.hostname.toLowerCase();
  const stageHost = host === "localhost" || host === "127.0.0.1" ||
    host === "::1" || /(?:^|[.-])(uat|staging|test)(?:[.-]|$)/i.test(host);
  assert(stageHost, "Only explicit staging/UAT or loopback API hosts are permitted.");
  assert(baseUrl.protocol === "https:" ||
    (baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(host)),
    "Non-loopback staging hosts must use HTTPS.");
  assert(baseUrl.pathname.replace(/\/+$/, "") === "/api/v1",
    "POS_UAT_API_BASE_URL must end in /api/v1.");
  assert(!baseUrl.username && !baseUrl.password && !baseUrl.search && !baseUrl.hash,
    "The API base URL must not include credentials, query parameters or fragments.");

  const base = baseUrl.origin + "/api/v1";
  const endpoint = (path) => base + path;
  const read = async (path, token, accept = "application/json") =>
    fetch(endpoint(path), { method: "GET", redirect: "manual", cache: "no-store",
      headers: { Accept: accept, ...(token ? {Authorization: `Bearer ${token}`} : {}) },
      signal: AbortSignal.timeout(15000) });
  let token;
  try {
    // A 404 here means the old API release is still deployed, not that UAT passed.
    const anonymous = await read("/admin/pos/tills");
    assert(anonymous.status === 401,
      `Expected unauthenticated till list HTTP 401, received ${anonymous.status}.`);
    console.log("PASS unauthenticated till list denied (401)");

    const login = await fetch(endpoint("/auth/sessions"), {
      method: "POST", redirect: "manual",
      headers: {"Content-Type": "application/json", Accept: "application/json"},
      body: JSON.stringify({email: env.POS_UAT_CASHIER_EMAIL, password: env.POS_UAT_CASHIER_PASSWORD, client: "native"}),
      signal: AbortSignal.timeout(15000),
    });
    assert(login.status === 201, `Test cashier sign-in failed (HTTP ${login.status}).`);
    const identity = (await login.json()).data;
    assert(identity?.actor?.role === "cashier", "Test identity is not a cashier.");
    assert(identity.actor.locationIds.includes(env.POS_UAT_ALLOWED_LOCATION_ID),
      "The cashier lacks its expected UAT stock-location assignment.");
    assert(/^[a-f0-9]{64}$/.test(identity.accessToken ?? ""), "Session access token is invalid.");
    token = identity.accessToken;
    console.log("PASS real cashier authentication and expected location assignment");

    const listResponse = await read("/admin/pos/tills", token);
    assert(listResponse.status === 200,
      `Cashier till list failed (HTTP ${listResponse.status}).`);
    const list = (await listResponse.json()).data;
    assert(Array.isArray(list?.sessions), "The list response has no verified sessions.");
    assert(list.sessions.length <= 50, "List exceeded its bounded server limit.");
    assert(list.sessions.every((x) => identity.actor.locationIds.includes(x.locationId)),
      "Cross-location till data appeared in the cashier list.");
    assert(list.enabled === true, "POS foundation is disabled in this staging environment; no authenticated till UAT completed.");

    const allowed = list.sessions.find((x) => x.locationId === env.POS_UAT_ALLOWED_LOCATION_ID);
    assert(Boolean(allowed?.id), "No real test till exists in the assigned UAT location.");
    assert(env.POS_UAT_DENIED_SESSION_ID !== allowed.id,
      "The denied till ID must be different from the allowed till.");
    const detail = await read(`/admin/pos/tills/${encodeURIComponent(allowed.id)}`, token);
    assert(detail.status === 200, `Assigned till detail failed (HTTP ${detail.status}).`);
    const report = await read(`/admin/pos/tills/${encodeURIComponent(allowed.id)}/reconciliation`, token);
    assert(report.status === 200, `Assigned till reconciliation failed (HTTP ${report.status}).`);
    const ledger = (await report.json()).data;
    assert(ledger?.locationId === env.POS_UAT_ALLOWED_LOCATION_ID,
      "Cash reconciliation returned a different location.");
    assert(ledger.scope === "cash_drawer_only" &&
      ledger.electronicPaymentsReconciled === false &&
      ledger.refundsReconciled === false,
      "Cash reconciliation overclaims payment or refund settlement.");
    const csv = await read(`/admin/pos/tills/${encodeURIComponent(allowed.id)}/reconciliation.csv`,
      token, "text/csv");
    assert(csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type") ?? ""),
      "Authorised cashier CSV is unavailable.");
    console.log("PASS assigned-location detail, cash-only reconciliation and CSV");

    for (const suffix of ["", "/reconciliation", "/reconciliation.csv"]) {
      const denied = await read(
        `/admin/pos/tills/${encodeURIComponent(env.POS_UAT_DENIED_SESSION_ID)}${suffix}`, token);
      assert(denied.status === 404,
        `Unassigned-location ${suffix || "detail"} leaked its existence (HTTP ${denied.status}).`);
    }
    console.log("PASS cross-branch guessed till ID, reconciliation and CSV denied (404)");
    console.log("PASS read-only cashier staging probe; no POS mutations executed");
  } finally {
    if (token) {
      // Revoke the temporary native test session; never print the bearer token.
      try {
        const logout = await fetch(endpoint("/auth/logout"), {
          method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
          body: "{}", signal: AbortSignal.timeout(15000),
        });
        if (logout.status !== 201 && logout.status !== 200) {
          console.error("WARNING test session logout returned HTTP " + logout.status);
        }
      } catch {
        console.error("WARNING unable to revoke temporary native test session.");
      }
    }
  }
}
main().catch((error) => {
  // Avoid printing URLs or credential-bearing request objects.
  console.error("FAIL POS cashier staging probe:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
