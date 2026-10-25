import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGhanaPhone, normalizeLoginIdentifier } from "../src/identity/ghana-phone";

test("Ghana phone normalization accepts common local and country-code forms", () => {
  assert.equal(normalizeGhanaPhone("024 123 4567"), "+233241234567");
  assert.equal(normalizeGhanaPhone("233-24-123-4567"), "+233241234567");
  assert.equal(normalizeGhanaPhone("+233 24 123 4567"), "+233241234567");
  assert.equal(normalizeGhanaPhone("24 123 4567"), "+233241234567");
  assert.equal(normalizeGhanaPhone("12345"), null);
});

test("login identifiers preserve normalized email or Ghana phone identity", () => {
  assert.deepEqual(normalizeLoginIdentifier(" Ama@example.COM "), { kind: "email", value: "ama@example.com" });
  assert.deepEqual(normalizeLoginIdentifier("0241234567"), { kind: "phone", value: "+233241234567" });
  assert.equal(normalizeLoginIdentifier("not-a-login").kind, "invalid");
});
