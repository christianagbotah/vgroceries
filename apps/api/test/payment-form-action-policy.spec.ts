import { test } from "node:test";
import assert from "node:assert/strict";
import { PaymentPolicyService } from "../src/payments/payment-policy.service";

function policy() {
  const config = {
    payments: {
      providerId: "etranzact",
      enabledMethods: ["hosted_checkout"],
      confirmedHoldMinutes: 1440,
      requestTimeoutMs: 5000,
      reconcileAfterSeconds: 120,
      hostedDomains: ["webpay.example.test"],
    },
  };
  return new PaymentPolicyService(config as any, {} as any, {} as any, {} as any);
}

const fields = { TERMINAL_ID: "0000000001", TRANSACTION_ID: "VG-PAY-1" };

test("provider form POST actions require HTTPS and a configured hosted domain", () => {
  const subject = policy();
  assert.throws(
    () => subject.validateProviderAction({ kind: "form_post", url: "http://webpay.example.test/pay", fields }),
    /HTTPS/i,
  );
  assert.throws(
    () => subject.validateProviderAction({ kind: "form_post", url: "https://evil.example/pay", fields }),
    /allowlist/i,
  );
  assert.deepEqual(
    subject.validateProviderAction({ kind: "form_post", url: "https://webpay.example.test/pay", fields }),
    { kind: "form_post", url: "https://webpay.example.test/pay", fields },
  );
});
