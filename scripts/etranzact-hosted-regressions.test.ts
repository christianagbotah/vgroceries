import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { paymentProviderActionSchema } from "../packages/contracts/src/payments";

describe("eTranzact hosted checkout boundary", () => {
  test("shared payment action accepts a bounded provider form POST", () => {
    const parsed = paymentProviderActionSchema.safeParse({
      kind: "form_post",
      url: "https://webpay.example.test/webconnect/v3/caller.jsp",
      fields: {
        TERMINAL_ID: "0000000001",
        TRANSACTION_ID: "VG-PAY-ABC123",
        AMOUNT: "123.45",
        CURRENCY_CODE: "GHS",
        CHECKSUM: "0123456789abcdef0123456789abcdef",
      },
    });
    expect(parsed.success).toBe(true);
  });

  test("checkout status submits provider form actions instead of exposing payment rails", () => {
    const source = readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx", "utf8");
    expect(source).toContain('result.action.kind === "form_post"');
    expect(source).toContain('form.method = "POST"');
    expect(source).toContain("form.submit()");
  });
});
