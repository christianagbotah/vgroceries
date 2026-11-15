#!/usr/bin/env node
"use strict";

/**
 * A release can have the correct Prisma schema and migrations yet still ship
 * an older node_modules/.prisma/client. Check the actual runtime client in
 * this API directory before publishing/switching a service.
 *
 * Usage: cd apps/api && node scripts/assert-generated-prisma-models.cjs
 * Read-only. Does not connect to PostgreSQL or print credentials.
 */
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createRequire } = require("node:module");

const cwd = process.cwd();
const runtimeRequire = createRequire(join(cwd, "package.json"));
const schema = readFileSync(join(cwd, "prisma/schema.prisma"), "utf8");
const { Prisma, Role } = runtimeRequire("@prisma/client");
const expected = new Map();

for (const match of schema.matchAll(/^model\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)^\}/gm)) {
  const fields = new Set();
  for (const sourceLine of match[2].split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("@") || line.startsWith("//")) continue;
    const field = line.match(/^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(?:\[\])?\??(?:\s|$)/);
    if (field) fields.add(field[1]);
  }
  expected.set(match[1], fields);
}

const actual = new Map(
  (Prisma?.dmmf?.datamodel?.models ?? []).map((m) => [
    m.name, new Set(m.fields.map((f) => f.name)),
  ]),
);
if (expected.size < 20 || actual.size < 20) {
  console.error("FAIL: missing or unusually small Prisma model manifest.");
  process.exit(1);
}

const discrepancies = [];
for (const [name, expectedFields] of expected) {
  const fields = actual.get(name);
  if (!fields) {
    discrepancies.push("missing generated model: " + name);
    continue;
  }
  for (const field of expectedFields)
    if (!fields.has(field)) discrepancies.push("missing generated field: " + name + "." + field);
  for (const field of fields)
    if (!expectedFields.has(field)) discrepancies.push("unexpected generated field: " + name + "." + field);
}
for (const name of actual.keys())
  if (!expected.has(name)) discrepancies.push("unexpected generated model: " + name);

if (Role?.cashier !== "cashier")
  discrepancies.push("generated Role enum is missing cashier");

if (discrepancies.length) {
  console.error("FAIL: generated Prisma runtime client does not match the repository schema.");
  discrepancies.slice(0, 30).forEach((message) => console.error(" -", message));
  if (discrepancies.length > 30) console.error("... plus", discrepancies.length - 30, "other differences");
  console.error("Run npm run generate in the target release's apps/api directory, then recheck.");
  process.exit(1);
}
console.log("PASS: generated Prisma runtime client matches " + expected.size + " schema models and fields.");
