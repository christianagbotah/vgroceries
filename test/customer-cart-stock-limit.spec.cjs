"use strict";

/**
 * Permanent stock-limit regression for the actual Zustand browser cart.
 * TypeScript is transpiled in-memory; no browser, mock backend or real DB.
 * Run: node --test test/customer-cart-stock-limit.spec.cjs
 */
const assert = require("node:assert/strict");
const { beforeEach, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const memory = new Map();

global.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};

const loaded = new Map();
function loadTypeScript(relative) {
  const filename = path.join(root, relative);
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const file = new Module(filename, module);
  file.filename = filename;
  file.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.set(filename, file);
  file.require = (id) =>
    id === "@/lib/quantity"
      ? loadTypeScript("src/lib/quantity.ts")
      : require(id);
  file._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return file.exports;
}

const { useCart } = loadTypeScript("src/features/checkout/cart-store.ts");
const createLine = (variantId, quantity = "1") => ({
  variantId,
  productId: "prd_" + variantId,
  quantity,
  name: "Test grocery",
  image: "/test.png",
  priceMinor: 200,
});

beforeEach(() => { useCart.getState().clear(); memory.clear(); });

test("one in stock: add one, prevent any second or third unit", () => {
  const { add } = useCart.getState();
  assert.equal(add(createLine("one"), "1"), true);
  assert.equal(add(createLine("one"), "1"), false);
  assert.equal(add(createLine("one", "2"), "1"), false);
  assert.equal(useCart.getState().lines[0].quantity, "1");
});

test("two in stock: cannot add a third even after separate quick-add clicks", () => {
  const { add, setQty } = useCart.getState();
  assert.equal(add(createLine("two"), "2"), true);
  assert.equal(add(createLine("two"), "2"), true);
  assert.equal(add(createLine("two"), "2"), false);
  assert.equal(setQty("two", "3", "2"), false);
  assert.equal(useCart.getState().lines[0].quantity, "2");
  assert.equal(setQty("two", "1", "2"), true);
  assert.equal(useCart.getState().lines[0].quantity, "1");
  assert.equal(setQty("two", "2", "2"), true);
  assert.equal(useCart.getState().lines[0].quantity, "2");
});

test("zero in stock: add fails closed and cannot create a cart line", () => {
  const { add } = useCart.getState();
  assert.equal(add(createLine("zero"), "0"), false);
  assert.equal(add(createLine("zero"), "-1"), false);
  assert.equal(add(createLine("zero"), "invalid"), false);
  assert.equal(add(createLine("zero")), false);
  assert.equal(useCart.getState().lines.length, 0);
});

test("stale cart stock decreased: no extra add, but can reduce to available", () => {
  const { add, setQty } = useCart.getState();
  assert.equal(add(createLine("stale", "3"), "3"), true);
  assert.equal(add(createLine("stale"), "1"), false);
  assert.equal(setQty("stale", "3", "1"), false);
  assert.equal(useCart.getState().lines[0].quantity, "3");
  assert.equal(setQty("stale", "1", "1"), true);
  assert.equal(useCart.getState().lines[0].quantity, "1");
  assert.equal(add(createLine("stale"), "1"), false);
});

test("item depleted to zero: old cart may be emptied but never increased", () => {
  const { add, setQty } = useCart.getState();
  assert.equal(add(createLine("depleted"), "1"), true);
  assert.equal(setQty("depleted", "2", "0"), false);
  assert.equal(setQty("depleted", "0", "0"), true);
  assert.equal(useCart.getState().lines.length, 0);
});

test("fractional stock: decimal sum respects 3-place stock cap", () => {
  const { add, setQty } = useCart.getState();
  assert.equal(add(createLine("kg", "0.25"), "0.4"), true);
  assert.equal(add(createLine("kg", "0.15"), "0.4"), true);
  assert.equal(useCart.getState().lines[0].quantity, "0.4");
  assert.equal(add(createLine("kg", "0.001"), "0.4"), false);
  assert.equal(setQty("kg", "0.401", "0.4"), false);
  assert.equal(setQty("kg", "0.2", "0.4"), true);
});

test("negative, malformed or unbounded additions never enter the cart", () => {
  const { add, setQty } = useCart.getState();
  for (const quantity of ["-2", "0", "1e3", "Infinity", "NaN", "1.0001"]) {
    assert.equal(add(createLine("malformed", quantity), "10"), false, quantity);
  }
  assert.equal(add(createLine("ordinary"), "10"), true);
  for (const quantity of ["-1", "Infinity", "1e10", "11", "1.0001"]) {
    assert.equal(setQty("ordinary", quantity, "10"), false, quantity);
  }
  assert.equal(useCart.getState().lines[0].quantity, "1");
});
