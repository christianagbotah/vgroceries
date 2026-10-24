import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("hosted payment form-post action", () => {
  test("checkout has a dedicated safe auto-submit form renderer", () => {
    expect(existsSync("src/features/checkout/provider-action-form.tsx")).toBe(true);
    const source = read("src/features/checkout/provider-action-form.tsx");
    expect(source).toContain('action.kind !== "form_post"');
    expect(source).toContain("Object.entries(action.fields)");
    expect(source).toContain('type="hidden"');
    expect(source).toContain("requestSubmit");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("innerHTML");
  });

  test("checkout status imports the provider form action renderer for the real payment flow", () => {
    const status = read("src/app/(storefront)/checkout/status/[id]/page.tsx");
    expect(status).toContain('from "@/features/checkout/provider-action-form"');
  });
});
