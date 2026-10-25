import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("phone-first customer identity", () => {
  test("shared identity contract makes email optional and accepts a login identifier", () => {
    const contracts = read("packages/contracts/src/identity.ts");
    expect(contracts).toContain("email: emailSchema.optional()");
    expect(contracts).toContain("identifier: loginIdentifierSchema");
    expect(contracts).toContain("legacyEmailLoginSchema");
  });

  test("customer records allow email-less accounts but keep normalized phones unique", () => {
    const schema = read("apps/api/prisma/schema.prisma");
    expect(schema).toContain("email String? @unique");
    expect(schema).toContain("phone String? @unique");
    const migration = "apps/api/prisma/migrations/202610240014_phone_first_customer_identity/migration.sql";
    expect(existsSync(migration)).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('UPDATE "User" SET "phone" = NULL');
    expect(sql).toContain('ALTER COLUMN "email" DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN "phone" DROP NOT NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX "User_phone_key"');
  });

  test("storefront signup requires phone, not email, and login accepts phone or email", () => {
    const signup = read("src/app/(storefront)/account/signup/page.tsx");
    const login = read("src/app/(storefront)/account/login/page.tsx");
    expect(signup).toContain("Email address (optional)");
    expect(signup).not.toContain('id="signup-email" type="email" autoComplete="email" className="h-11 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required');
    expect(login).toContain("Phone number or email");
    expect(login).toContain("identifier");
    expect(login).not.toContain('type="email"');
  });
});
