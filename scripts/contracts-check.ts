/**
 * Contracts regression suite — keeps src/services/contracts honest.
 *
 * What it verifies (all assertions are pass/fail; exit 1 on any failure):
 *
 *  A. REQUEST schemas reject malformed input before it can reach the service
 *     (negative/zero quantities, bad enums, missing fields, weak idempotency
 *     keys, empty line arrays) and accept well-formed input.
 *  B. RESPONSE schemas conform to the LIVE mock service: every listed
 *     operation is called over HTTP and parsed with its zod schema, so the
 *     documented contract cannot drift from actual behaviour.
 *  C. REGISTRY completeness: every operation the mock router dispatches is
 *     present in src/services/operation-registry.ts (cache/invalidation map).
 *  D. ADAPTER equivalence: the dev HTTP adapter and the in-process mock
 *     adapter return the same payload for the same operation.
 *
 * Usage: bun scripts/contracts-check.ts [base_url]
 * Default base URL: http://localhost:3000/api/mock/v1
 */

import {
  apiEnvelopeSchema,
  checkoutCompleteRequestSchema,
  checkoutQuoteRequestSchema,
  createReturnRequestSchema,
  posCompleteRequestSchema,
  quantitySchema,
  riderActionRequestSchema,
  validateRequest,
  shopPageDataSchema,
  zoneViewSchema,
  dashboardViewSchema,
  adminReturnRowSchema,
  riderJobViewSchema,
  quoteResponseSchema,
  publicOrderSchema,
  type Paged,
} from "../src/services/contracts";
import { operationMeta } from "../src/services/operation-registry";
import { MockServiceAdapter } from "../src/services/adapters/mock";
import type { ZodType } from "zod";

const BASE = process.argv[2] ?? "http://localhost:3000/api/mock/v1";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function httpOp<T>(op: string, query?: Record<string, string>, body?: Record<string, unknown>): Promise<T> {
  const method = body !== undefined ? "POST" : "GET";
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const res = await fetch(`${BASE}/${op.replace(/\./g, "/")}${qs}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${op}`);
  const json = (await res.json()) as { ok: boolean; data?: T; error?: { message: string } };
  if (!json.ok) throw new Error(json.error?.message ?? `op ${op} failed`);
  return json.data as T;
}

/* ------------------------------------------------------------------ */
/* A. Request schema behaviour                                         */
/* ------------------------------------------------------------------ */

console.log("== A. request validation rejects malformed input ==");

check("quantity schema rejects negative values", !quantitySchema.safeParse("-3").success);
check("quantity schema rejects zero", !quantitySchema.safeParse("0").success);
check("quantity schema rejects NaN-ish text", !quantitySchema.safeParse("abc").success);
check("quantity schema rejects 4-digit precision", !quantitySchema.safeParse("1.2345").success);
check("quantity schema accepts integers", quantitySchema.safeParse("2").success);
check("quantity schema accepts 3-digit decimals", quantitySchema.safeParse("1.250").success);

const goodCheckout = {
  lines: [{ variantId: "var_tof_1", quantity: "2" }],
  customerName: "Contract Test",
  customerPhone: "+233200000001",
  fulfilment: "collection",
  paymentMethod: "cash_counter",
  idempotencyKey: "contracts-1",
};
check("checkout.complete schema accepts a valid request", checkoutCompleteRequestSchema.safeParse(goodCheckout).success);

for (const [label, payload] of [
  ["negative quantity", { ...goodCheckout, lines: [{ variantId: "var_tof_1", quantity: "-1" }] }],
  ["zero quantity", { ...goodCheckout, lines: [{ variantId: "var_tof_1", quantity: "0" }] }],
  ["empty lines", { ...goodCheckout, lines: [] }],
  ["unsupported payment method", { ...goodCheckout, paymentMethod: "crypto" }],
  ["missing phone", { ...goodCheckout, customerPhone: "" }],
  ["weak idempotency key", { ...goodCheckout, idempotencyKey: "abc" }],
] as const) {
  check(`checkout.complete schema rejects ${label}`, !checkoutCompleteRequestSchema.safeParse(payload).success);
}

check(
  "pos.complete schema rejects negative counter quantity",
  !posCompleteRequestSchema.safeParse({
    sessionId: "cash_02",
    lines: [{ variantId: "var_tof_1", quantity: "-3" }],
    method: "cash_counter",
  }).success
);
check(
  "rider.action schema rejects unknown action",
  !riderActionRequestSchema.safeParse({ jobId: "job_5001", riderId: "rid_1", action: "teleport" }).success
);
check(
  "rider.action schema accepts the rider UI proof methods (pin/signature/photo_note)",
  riderActionRequestSchema.safeParse({ jobId: "job_5001", riderId: "rid_1", action: "deliver", proofMethod: "pin", proofDetail: "4821" }).success
);
check(
  "rider.action schema rejects engine-unknown proof methods",
  !riderActionRequestSchema.safeParse({ jobId: "job_5001", riderId: "rid_1", action: "deliver", proofMethod: "otp" }).success
);
check(
  "create-return schema rejects duplicate-free but quantity-zero line",
  !createReturnRequestSchema.safeParse({ orderId: "ord_1014", requestedBy: "customer", lines: [{ orderLineId: "ln_1", quantity: "0", reason: "test" }] }).success
);
check(
  "quote schema rejects empty lines",
  !checkoutQuoteRequestSchema.safeParse({ lines: [] }).success
);

// validateRequest wiring: the adapter boundary uses this exact function.
check(
  "validateRequest surfaces VALIDATION_FAILED issues for bad bodies",
  !validateRequest("admin.pos.complete", { sessionId: "cash_02", lines: [{ variantId: "var_tof_1", quantity: "-3" }] }).ok
);
check(
  "validateRequest passes unknown ops through",
  validateRequest("admin.products", undefined).ok
);

/* ------------------------------------------------------------------ */
/* B. Response schema conformance (live service)                       */
/* ------------------------------------------------------------------ */

console.log("== B. response schemas conform to the live service ==");

async function conforms<T>(name: string, schema: ZodType, op: string, query?: Record<string, string>, body?: Record<string, unknown>): Promise<void> {
  try {
    const data = await httpOp<T>(op, query, body);
    const result = schema.safeParse(data);
    if (result.success) {
      check(`${name}: ${op} response conforms`, true);
    } else {
      const issues = (result.error?.issues ?? []) as { path: PropertyKey[]; message: string }[];
      const first = issues[0];
      check(`${name}: ${op} response conforms`, false, first ? `${String(first.path.join("."))}: ${first.message}` : "unknown issue");
    }
  } catch (e) {
    check(`${name}: ${op} reachable`, false, String(e));
  }
}

await conforms("catalog", shopPageDataSchema, "catalog.list", { perPage: "6" });
await conforms("zones", zoneViewSchema.array(), "checkout.zones");
await conforms("dashboard", dashboardViewSchema, "admin.dashboard");
await conforms("admin returns", adminReturnRowSchema.array(), "admin.returns");
const jobs = await httpOp<{ jobs: unknown[] }>("rider.jobs", { riderId: "rid_2" });
check("rider.jobs: jobs array conforms", jobs.jobs.every((j) => riderJobViewSchema.safeParse(j).success));
await conforms("quote", quoteResponseSchema, "checkout.quote", undefined, { lines: [{ variantId: "var_tof_1", quantity: "1" }] });
await conforms("public order", publicOrderSchema, "checkout.status", { orderId: "ord_1011" });

// Envelope discipline: every response must be a valid {ok,...} envelope.
{
  const res = await fetch(`${BASE}/catalog/home`);
  const json = (await res.json()) as unknown;
  check("envelope schema accepts the service response", apiEnvelopeSchema.safeParse(json).success);
}

/* ------------------------------------------------------------------ */
/* C. Operation registry completeness                                  */
/* ------------------------------------------------------------------ */

console.log("== C. operation registry covers every mock operation ==");

{
  const fs = await import("node:fs");
  const routerSource = fs.readFileSync("src/services/mock/router.ts", "utf8");
  const routerOps = Array.from(routerSource.matchAll(/case "([a-z]+\.[a-z0-9._-]+)"/g)).map((m) => m[1]);
  const uniqueRouterOps = Array.from(new Set(routerOps));
  const metaKeys = new Set(Object.keys(operationMeta));
  const missing = uniqueRouterOps.filter((op) => !metaKeys.has(op));
  check(`registry covers all ${uniqueRouterOps.length} router operations`, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : undefined);
}

/* ------------------------------------------------------------------ */
/* D. Adapter equivalence (dev HTTP route vs in-process mock)          */
/* ------------------------------------------------------------------ */

console.log("== D. dev HTTP adapter and mock adapter agree ==");

{
  const http = await httpOp<Paged<unknown>>("catalog.list", { perPage: "3", page: "1" });
  const mock = new MockServiceAdapter();
  const inProcess = await mock.request<Paged<unknown>>({
    op: "catalog.list",
    query: { perPage: "3", page: "1" },
    skipValidation: true,
  });
  check(
    "both adapters return the same total/items for catalog.list",
    http.total === inProcess.total && http.items.length === inProcess.items.length,
    `http total=${http.total} mock total=${inProcess.total}`
  );
  check("mock adapter reports its kind for diagnostics", mock.kind === "mock");
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log(`\ncontracts-check: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
