/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("admin customer production-data UX", () => {
  test("production-backed customer records are not mislabeled as demo data", () => {
    const page = read("src/app/admin/customers/page.tsx");
    expect(page).not.toContain("Customer record (demo data)");
    expect(page).not.toContain("Demo contacts are fictional");
    expect(page).toContain("Customer account and order history");
  });
});
