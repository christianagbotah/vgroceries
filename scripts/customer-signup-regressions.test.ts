import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("customer sign-up regressions", () => {
  test("storefront exposes a real customer sign-up route beside sign-in", () => {
    expect(existsSync("src/app/(storefront)/account/signup/page.tsx")).toBe(true);
    const login = read("src/app/(storefront)/account/login/page.tsx");
    const layout = read("src/app/(storefront)/account/layout.tsx");
    expect(login).toContain("/account/signup");
    expect(login).toContain("Create an account");
    expect(layout).toContain('pathname === "/account/signup"');
  });

  test("browser client maps sign-up to the production registration endpoint", () => {
    const client = read("src/services/client.ts");
    const endpoints = read("packages/contracts/src/endpoints.ts");
    const validation = read("packages/contracts/src/validation.ts");
    const operations = read("src/services/operation-registry.ts");
    expect(client).toContain("accountSignup");
    expect(client).toContain('api<WebSessionResponse>("auth.signup"');
    expect(endpoints).toContain('"auth.signup": {"method": "POST", "path": "/auth/register"}');
    expect(validation).toContain('"auth.signup": registerRequestSchema');
    expect(operations).toContain('"auth.signup": { invalidates: ["*"] }');
  });

  test("sign-up form never lets the browser choose role or account authority", () => {
    const signup = read("src/app/(storefront)/account/signup/page.tsx");
    expect(signup).toContain("accountSignup");
    expect(signup).toContain("confirmPassword");
    expect(signup).not.toContain('role: "admin"');
    expect(signup).not.toContain('name="role"');
  });
});
