import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const workflow=readFileSync(".github/workflows/versioned-release.yml","utf8");
describe("versioned checkout rollout",()=>{
  test("explicit default-off flags are compiled into the production storefront and recorded in release notes",()=>{
    expect(workflow).toMatch(/enable_order_sms:\s*description:[^\n]+\s*type: boolean\s*default: false/);
    expect(workflow).toMatch(/enable_hubtel_refresh:\s*description:[^\n]+\s*type: boolean\s*default: false/);
    expect(workflow).toContain("NEXT_PUBLIC_ORDER_SMS_OPT_IN_ENABLED: ${{ inputs.enable_order_sms && '1' || '0' }}");
    expect(workflow).toContain("NEXT_PUBLIC_HUBTEL_CUSTOMER_PAYMENT_REFRESH_ENABLED: ${{ inputs.enable_hubtel_refresh && '1' || '0' }}");
    expect(workflow).toContain("order SMS=$ENABLE_ORDER_SMS; active Hubtel refresh=$ENABLE_HUBTEL_REFRESH");
  });
  test("exact main verification and runtime worker entrypoints are mandatory",()=>{
    expect(workflow).toContain("event=push&branch=main&status=success");
    expect(workflow).toContain("test -f apps/api/dist/scripts/run-order-sms.js");
    expect(workflow).toContain("test -f apps/api/dist/scripts/recover-hosted-payments.js");
    expect(workflow).toContain("--draft");
  });
});

test("email checkout release gate remains independently default-off and packages its worker",()=>{
  expect(workflow).toMatch(/enable_order_email:\s*description:[^\n]+\s*type: boolean\s*default: false/);
  expect(workflow).toContain("NEXT_PUBLIC_ORDER_EMAIL_OPT_IN_ENABLED: ${{ inputs.enable_order_email && '1' || '0' }}");
  expect(workflow).toContain("order email=$ENABLE_ORDER_EMAIL");
  expect(workflow).toContain("test -f apps/api/dist/scripts/run-order-email.js");
});
