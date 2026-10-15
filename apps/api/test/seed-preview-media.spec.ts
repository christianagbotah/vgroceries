import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "scripts/seed-preview.ts"), "utf8");

test("preview seed never publishes the sketch placeholder image", () => {
  assert.equal(source.includes('/images/placeholder.webp'), false);
  assert.match(source, /https:\/\/images\.unsplash\.com\/photo-/);
});

test("preview seed repairs media on existing preview rice rows", () => {
  const productBlock = source.match(/where: \{ id: "preview_rice" \}[\s\S]*?\n\s*\}\);/s)?.[0] ?? "";
  assert.match(productBlock, /update:\s*\{[\s\S]*?image:/s);
});
