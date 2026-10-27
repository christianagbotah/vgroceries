/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loginRequestSchema, normalizeGhanaPhone, registerRequestSchema } from "../packages/contracts/src/identity";

const read = (path: string) => readFileSync(path, "utf8");

describe("customer phone-first identity", () => {
  test("shared registration contract requires phone but not email and normalizes Ghana phone", () => {
    const parsed = registerRequestSchema.safeParse({
      name: "Ama Mensah",
      phone: "024 123 4567",
      password: "Strong-customer-password-2026",
      client: "web",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(normalizeGhanaPhone(parsed.data.phone)).toBe("+233241234567");
      expect(parsed.data.email).toBeUndefined();
    }
  });

  test("login contract accepts either customer phone or legacy email, never neither/both", () => {
    expect(loginRequestSchema.safeParse({ phone: "0241234567", password: "password", client: "web" }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: "ama@example.test", password: "password", client: "web" }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ password: "password", client: "web" }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: "ama@example.test", phone: "0241234567", password: "password", client: "web" }).success).toBe(false);
  });

  test("storefront signup makes email optional and customer login is phone-or-email", () => {
    const signup = read("src/app/(storefront)/account/signup/page.tsx");
    const login = read("src/app/(storefront)/account/login/page.tsx");
    const client = read("src/services/client.ts");
    expect(signup).toContain("Email address (optional)");
    expect(signup).not.toMatch(/id="signup-email"[^>]*required/);
    expect(signup).toContain("accountSignup(name, phone, password, email");
    expect(login).toContain("Phone number or email");
    expect(login).toContain("accountLogin(identifier, password)");
    expect(client).toContain('identifier.includes("@")');
    expect(client).toContain("{ phone: identifier");
  });
});
