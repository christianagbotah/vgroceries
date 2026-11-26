import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
describe("order-only checkout email preference",()=>{
 const page=readFileSync("src/app/(storefront)/checkout/page.tsx","utf8");
 test("default off, independent opt-in, reset when destination changes",()=>{
  expect(page).toContain("const [emailUpdatesOptIn, setEmailUpdatesOptIn] = useState(false)");
  expect(page).toContain('NEXT_PUBLIC_ORDER_EMAIL_OPT_IN_ENABLED === "1"');
  expect(page).toContain("emailUpdatesEnabled && customerEmail.trim()");
  expect(page).toContain("...(emailUpdatesEnabled && emailUpdatesOptIn ? { emailUpdatesOptIn: true } : {})");
  expect(page).toContain("setCustomerEmail(e.target.value); setEmailUpdatesOptIn(false);");
  expect(page).toContain("Verify your email address to receive these messages.");
 });
 test("checkout persists consent with order before outbox, never manufactures mailbox proof",()=>{
  const service=readFileSync("apps/api/src/orders/checkout-command.service.ts","utf8");
  expect(service).toContain('CUSTOMER_ORDER_EMAIL_CONSENT_ENABLED!=="true"');
  expect(service).toContain("tx.orderEmailConsent.create");
  expect(service.indexOf("if(replay)return replay;")).toBeLessThan(service.indexOf("CUSTOMER_ORDER_EMAIL_CONSENT_ENABLED"));
  expect(service.indexOf("tx.orderEmailConsent.create")).toBeLessThan(service.indexOf('type:"order.created"'));
  expect(service).not.toContain("verifiedAt:");
 });
});
