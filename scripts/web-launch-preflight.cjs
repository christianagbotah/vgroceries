#!/usr/bin/env node
"use strict";

/**
 * Read-only web launch gate. No payments, texts, emails or database writes.
 * Running:
 * node --env-file=/path/to/PRIVATE/staging.env scripts/web-launch-preflight.cjs
 *
 * Output contains only status labels and preapproved public URLs.
 * Never print values of provider credentials, tokens, origins or DB secrets.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const STAGING = "https://portal.varietygroceries.com";
const PRODUCTION = "https://varietygroceries.com";
const PAYMENTS = [
  "PAYMENT_PROVIDER_ID", "PAYMENT_ENABLED_METHODS",
  "PAYMENT_CONFIRMED_HOLD_MINUTES", "PAYMENT_PROVIDER_TIMEOUT_MS",
  "PAYMENT_RECONCILE_AFTER_SECONDS", "PAYMENT_HOSTED_DOMAINS",
];
const HUBTEL_COLLECTION = [
  "HUBTEL_CLIENT_ID", "HUBTEL_CLIENT_SECRET",
  "HUBTEL_REQUEST_MONEY_URL", "HUBTEL_STATUS_URL",
  "HUBTEL_CALLBACK_URL", "HUBTEL_RETURN_URL",
  "HUBTEL_CANCELLATION_URL",
];
const HUBTEL_REFUND = [
  "HUBTEL_REFUND_BASE_URL", "HUBTEL_REFUND_BASIC_USERNAME",
  "HUBTEL_REFUND_BASIC_PASSWORD", "HUBTEL_REFUND_COLLECTION_ACCOUNT",
  "HUBTEL_REFUND_CALLBACK_ORIGIN", "HUBTEL_REFUND_CALLBACK_SECRET",
];
const status = {
  pass: "PASS", blocker: "BLOCKER", pending: "PENDING UAT",
  deferred: "DEFERRED",
};
const has = (env, key) => typeof env[key] === "string" && env[key].trim().length > 0;

function providerAssessment(env = {}) {
  const configured = keys => keys.filter(key => has(env, key));
  const money = configured(PAYMENTS);
  const collection = configured(HUBTEL_COLLECTION);
  const refund = configured(HUBTEL_REFUND);
  return {
    paymentBundle: money.length === 0 ? "absent" : money.length === PAYMENTS.length ? "complete" : "partial",
    hubtelCollection: collection.length === 0 ? "absent" : collection.length === HUBTEL_COLLECTION.length ? "complete" : "partial",
    hubtelRefund: refund.length === 0 ? "absent" : refund.length === HUBTEL_REFUND.length ? "complete" : "partial",
    selectedHubtel: env.PAYMENT_PROVIDER_ID === "hubtel",
  };
}

function add(rows, id, name, result, evidence, action) {
  if (!status[result]) throw new Error("Invalid readiness category.");
  rows.push({ id, name, result: status[result], evidence, next: action });
}

function latestSafeStagingBackup(dir, now = Date.now()) {
  const backupName = /^.*(variety|portal|staging).*\.dump$/i;
  try {
    const rows = fs.readdirSync(dir)
      .filter(name => backupName.test(name))
      .map(name => {
        const file = path.join(dir, name);
        const info = fs.statSync(file);
        return info.isFile() && info.size >= 100_000
          ? { createdAt: info.mtimeMs, size: info.size, ageHours: Math.round((now - info.mtimeMs) / 3600000) }
          : null;
      })
      .filter(Boolean).sort((a,b)=>b.createdAt - a.createdAt);
    return rows[0] || null;
  } catch { return null; }
}

function evaluateGates({ env, http, backup, smsImplemented = false }) {
  const rows = [];
  add(rows, "STG-01", "Staging API readiness",
    http.apiReady === 200 ? "pass" : "blocker",
    http.apiReady === 200 ? "Readiness endpoint returned 200." : "Staging API not verified healthy.",
    "Repair staging API before taking any orders.");
  add(rows, "STG-02", "Anonymous customer shop",
    http.shop === 200 ? "pass" : "blocker",
    http.shop === 200 ? "Shop reachable without a login." : "Public shop not verified.",
    "Restore anonymous storefront availability.");
  add(rows, "SEC-01", "Private POS customer directory",
    [401,403].includes(http.posCustomersAnon) ? "pass" : "blocker",
    [401,403].includes(http.posCustomersAnon) ? "Unauthenticated customer search denied." : "Private customer-search access not safely verified.",
    "Do not expose registered customers to unauthenticated visitors.");
  add(rows, "SEC-02", "Private inventory endpoint",
    [401,403].includes(http.inventoryAnon) ? "pass" : "blocker",
    [401,403].includes(http.inventoryAnon) ? "Unauthenticated inventory report denied." : "Privileged inventory isolation not safely verified.",
    "Restrict inventory to authorised staff.");
  add(rows, "REL-01", "Public production remains closed",
    http.productionComingSoon === true ? "pass" : "blocker",
    http.productionComingSoon ? "Coming Soon confirmed." : "Public launch boundary could not be confirmed.",
    "Retain Coming Soon until approved release and cutover.");
  const provider = providerAssessment(env);
  const payReady = provider.paymentBundle === "complete" &&
    provider.hubtelCollection === "complete" && provider.selectedHubtel;
  add(rows, "PAY-01", "Hubtel merchant settings", payReady ? "pending" : "blocker",
    payReady ? "Server-side payment bundle configured; live payment not yet verified."
      : "Missing/incomplete server-side Hubtel payment configuration (no credentials disclosed).",
    "Business supplies secure merchant credentials; validate initiation and verified callbacks.");
  add(rows, "PAY-02", "Hubtel refund and settlement", provider.hubtelRefund === "complete" ? "pending" : "blocker",
    provider.hubtelRefund === "complete" ? "Refund bundle present; reconciliation sign-off absent."
      : "Refund configuration absent or incomplete.",
    "Validate refund callback, duplicate events, reconciliation and permitted partial-refund policy.");
  add(rows, "SMS-01", "Actual SMS/OTP delivery", smsImplemented ? "pending" : "blocker",
    smsImplemented ? "SMS transport and separately gated worker configured; real handset delivery still unverified."
      : "No complete, independently enabled SMS provider/dispatch configuration verified.",
    "Integrate supported Ghana SMS provider, consent/suppression, OTP and real recipient delivery.");
  add(rows, "EML-01", "Recovery email inbox receipt", "pending",
    has(env,"PASSWORD_RESET_FROM") && has(env,"PASSWORD_RESET_PUBLIC_ORIGIN")
      ? "Reset service configured; inbox receipt and SPF/DKIM not independently verified."
      : "Email recovery configuration missing or incomplete.",
    "Verify inbox delivery, sender reputation and verified-email account ownership.");
  add(rows, "OPS-01", "Latest restricted staging backup", backup && backup.ageHours <= 24 ? "pass" : "pending",
    backup && backup.ageHours <= 24
      ? `Staging backup is ${backup.ageHours} hours old and nonempty.`
      : "No recent local staging backup verified.",
    "Take a private backup immediately before migration/cutover.");
  add(rows, "OPS-02", "Production restore and rollback drill", "pending",
    "No signed recovery evidence supplied to this preflight.",
    "Perform and sign off a production-equivalent restore and rollback rehearsal.");
  add(rows, "UAT-01", "Payments and cashier real-operation acceptance", "pending",
    "Unit and synthetic tests do not establish real tender or provider settlement.",
    "Complete authorised cashier, reconciliation and payment-provider acceptance.");
  add(rows, "UAT-02", "Customer, stock, dispatch and delivery acceptance", "pending",
    "Business sign-off still required for complete customer order lifecycle.",
    "Test stock=0/1, simultaneous POS+online requests, pickup/COD, handover and exceptions.");
  add(rows, "BUS-01", "Business launch approval", "pending",
    "Explicit production cutover approval has not been supplied.",
    "Obtain signed owner approval after all critical gates are verified.");
  add(rows, "MOB-01", "Installable Android/iOS apps", "deferred",
    "No confirmed APK, IPA, TestFlight or native Expo project; web-first scope.",
    "Plan native engineering, device UAT and releases separately.");
  return {
    target: "Conditional controlled web launch on 20–21 November 2026",
    readiness: rows.every(row => row.result === "PASS" || row.result === "DEFERRED")
      ? "READY_FOR_HUMAN_SIGNOFF" : "NO_GO",
    checks: rows, counts: Object.fromEntries(Object.values(status).map(label=>[
      label,rows.filter(row=>row.result===label).length,
    ])),
  };
}

async function probe(url, timeoutMs = 8500) {
  if (![STAGING,PRODUCTION].some(base=>url.startsWith(base+"/") || url === base))
    throw new Error("Preflight may probe only approved public Variety domains.");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual", cache: "no-store" });
    return {
      status: response.status,
      text: url === PRODUCTION+"/" ? (await response.text()).slice(0,160000) : "",
    };
  } catch { return { status: 0, text: "" }; }
}

async function run(env = process.env) {
  const [ready,shop,search,inventory,production] = await Promise.all([
    probe(STAGING+"/api/v1/health/ready"),
    probe(STAGING+"/shop"),
    probe(STAGING+"/api/v1/admin/pos/customers?q=test"),
    probe(STAGING+"/api/v1/inventory/overview"),
    probe(PRODUCTION+"/"),
  ]);
  const backup = latestSafeStagingBackup("/home/lightworld/backups/varietygroceries-stage-consolidation");
  // Credentials alone do not establish delivery. Only a fully enabled
  // dispatcher with an explicit activation cutoff upgrades SMS to pending UAT.
  const smsConfigured = env.HUBTEL_SMS_ENABLED === "true" &&
    env.SMS_DISPATCH_WORKER_ENABLED === "true" &&
    ["HUBTEL_SMS_CLIENT_ID", "HUBTEL_SMS_CLIENT_SECRET",
      "HUBTEL_SMS_SENDER_ID", "SMS_DISPATCH_ACTIVATED_AT"].every(key => has(env, key)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(env.SMS_DISPATCH_ACTIVATED_AT ?? "") &&
    Number.isFinite(Date.parse(env.SMS_DISPATCH_ACTIVATED_AT)) &&
    Date.parse(env.SMS_DISPATCH_ACTIVATED_AT) <= Date.now() + 60000;
  const report = evaluateGates({ env, backup, smsImplemented: smsConfigured,
    http: {
      apiReady: ready.status, shop: shop.status,
      posCustomersAnon: search.status, inventoryAnon: inventory.status,
      productionComingSoon: production.status === 200 &&
        /Variety Groceries\s*[—-]\s*Coming Soon/.test(production.text),
    },
  });
  return { checkedAt: new Date().toISOString(), ...report };
}

function markdown(report) {
  const rows = [
    "# Variety Groceries — web launch preflight",
    "",
    `Checked (UTC): ${report.checkedAt}`,
    `Target: ${report.target}`,
    `Overall result: **${report.readiness}**`,
    "",
    "| Gate | Status | Evidence | Required next action |",
    "| --- | --- | --- | --- |",
    ...report.checks.map(row=>`| ${row.name} | ${row.result} | ${row.evidence} | ${row.next} |`),
    "",
    "This is a read-only audit, not permission to switch production traffic. Secret values are never reported.",
    "",
  ];
  return rows.join("\n");
}

if (require.main === module) {
  run().then(report=>{
    console.log(markdown(report));
    // Exit 2 is expected until the whole release gate is signed off.
    process.exitCode = report.readiness === "NO_GO" ? 2 : 0;
  }).catch(err=>{
    console.error("Launch preflight failed (safe error type):", err.name || "Error");
    process.exitCode = 1;
  });
}

module.exports = { providerAssessment, latestSafeStagingBackup, evaluateGates, markdown, run };
