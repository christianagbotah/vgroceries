/** Prevent regressions to ambiguous customer order dates. Run with Node 24+. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatDateTime } from "../src/lib/format.ts";

const first = formatDateTime("2026-11-21T05:12:10.828Z");
const nextYear = formatDateTime("2027-01-01T00:05:00.000Z");
assert.equal(first, "21 Nov 2026, 05:12");
assert.equal(nextYear, "1 Jan 2027, 00:05");
assert.notEqual(first, nextYear);
for (const path of [
  "src/app/(storefront)/track/page.tsx",
  "src/app/(storefront)/account/orders/[id]/page.tsx",
  "src/app/(storefront)/checkout/status/[id]/page.tsx",
  "src/app/admin/orders/[id]/page.tsx",
]) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  assert.match(source, /Placed \{formatDateTime\(order\.createdAt\)\} UTC/, path);
  assert.doesNotMatch(source, /Placed \{order\.createdAtLabel\}/, path);
}
for (const path of [
  "src/components/orders/order-tracking-journey.tsx",
  "src/app/(storefront)/track/page.tsx",
]) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  assert.match(source, /formatDateTime\(/, path);
}
console.log("Customer order dates: year-inclusive, human-readable, and UTC-stable — PASS");
