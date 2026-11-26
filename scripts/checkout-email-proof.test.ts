import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
describe("email verification is owner scoped and independent of payment",()=>{
 test("order status connects an independently gated panel",()=>{
  const s=readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx","utf8");
  expect(s).toContain('NEXT_PUBLIC_ORDER_EMAIL_OPT_IN_ENABLED === "1"');
  expect(s).toContain("<OrderEmailVerification key={order.id} orderId={order.id}");
 });
 test("verification and revocation act on the existing order only",()=>{
  const s=readFileSync("src/features/checkout/order-email-verification.tsx","utf8");
  expect(s).toContain("apiOps.orderEmailUpdatesStatus(orderId)");
  expect(s).toContain("apiOps.orderEmailUpdatesAction(orderId,body)");
  expect(s).toContain('action:"revoke"');
  expect(s).toContain("This optional step does not affect your payment.");
  expect(s).not.toContain("paymentInitiate");
  expect(s).not.toContain("localStorage");
 });
});
