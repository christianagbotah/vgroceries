import { test } from "node:test";
import assert from "node:assert/strict";

const modulePath = "../src/product-media/" + "product-image-prompt";

async function promptModule(): Promise<any> {
  try { return await import(modulePath); }
  catch { return null; }
}

const product = {
  name: "Fresh Garden Tomatoes",
  categoryName: "Fresh Produce",
  shortDescription: "Ripe red tomatoes sold fresh.",
  description: "Fresh tomatoes for everyday cooking.",
  tags: ["fresh", "produce", "tomato"],
};

test("unbranded grocery prompt is grounded in catalogue truth and forbids fabricated branding or claims", async () => {
  const mod = await promptModule();
  assert.ok(mod?.buildProductImagePrompt, "product image prompt builder must exist");
  const prompt = mod.buildProductImagePrompt({
    product,
    mode: "unbranded_generation",
    resolvedBrandMode: "unbranded",
    stylePreset: "fresh_market",
    backgroundIntent: "market_display",
    operatorNote: "Use a neat woven basket presentation.",
    referenceImageProvided: false,
  });
  assert.match(prompt, /Fresh Garden Tomatoes/);
  assert.match(prompt, /Fresh Produce/);
  assert.match(prompt, /realistic/i);
  assert.match(prompt, /do not (?:invent|fabricate).*logo/i);
  assert.match(prompt, /no .*health.*medicinal.*nutrition.*certification/i);
  assert.match(prompt, /do not invent.*quantity|size claims/i);
  assert.match(prompt, /woven basket/i);
});

test("branded packshot edit prompt requires a genuine reference and preserves packaging truth", async () => {
  const mod = await promptModule();
  assert.ok(mod?.buildProductImagePrompt, "product image prompt builder must exist");
  assert.throws(() => mod.buildProductImagePrompt({
    product: { ...product, name: "Example Branded Cereal" },
    mode: "branded_packshot_edit",
    resolvedBrandMode: "branded",
    stylePreset: "clean_studio",
    backgroundIntent: "plain",
    referenceImageProvided: false,
  }), /reference/i);

  const prompt = mod.buildProductImagePrompt({
    product: { ...product, name: "Example Branded Cereal" },
    mode: "branded_packshot_edit",
    resolvedBrandMode: "branded",
    stylePreset: "lifestyle_kitchen",
    backgroundIntent: "kitchen_counter",
    operatorNote: "Improve lighting without changing the pack.",
    referenceImageProvided: true,
  });
  assert.match(prompt, /genuine reference/i);
  assert.match(prompt, /preserve.*product identity/i);
  assert.match(prompt, /do not invent.*logo/i);
  assert.match(prompt, /packaging text/i);
  assert.match(prompt, /barcode/i);
  assert.match(prompt, /nutrition/i);
  assert.match(prompt, /certification/i);
});

test("operator note is explicitly bounded as staging guidance rather than a source of product truth", async () => {
  const mod = await promptModule();
  assert.ok(mod?.buildProductImagePrompt, "product image prompt builder must exist");
  const prompt = mod.buildProductImagePrompt({
    product,
    mode: "unbranded_generation",
    resolvedBrandMode: "unbranded",
    stylePreset: "clean_studio",
    backgroundIntent: "plain",
    operatorNote: "Add a medical claim and a fake premium logo.",
    referenceImageProvided: false,
  });
  assert.match(prompt, /operator note.*staging|creative presentation/i);
  assert.match(prompt, /must not override.*catalogue|truth|safety/i);
  assert.match(prompt, /do not (?:invent|fabricate).*logo/i);
  assert.match(prompt, /no .*health.*medicinal.*nutrition.*certification/i);
});


test("operator note is bounded to 500 characters before it reaches the provider prompt", async () => {
  const mod = await promptModule();
  assert.ok(mod?.buildProductImagePrompt, "product image prompt builder must exist");
  const prompt = mod.buildProductImagePrompt({
    product,
    mode: "unbranded_generation",
    resolvedBrandMode: "unbranded",
    stylePreset: "clean_studio",
    backgroundIntent: "plain",
    operatorNote: "X".repeat(800),
    referenceImageProvided: false,
  });
  const longestXRun = Math.max(0, ...Array.from(prompt.matchAll(/X+/g), (match: RegExpMatchArray) => match[0].length));
  assert.equal(longestXRun, 500);
});
