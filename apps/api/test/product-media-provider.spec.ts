import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const fakePath = "../src/product-media/" + "fake-image-generation.provider";
const openAiPath = "../src/product-media/" + "openai-image-generation.provider";
const errorsPath = "../src/product-media/" + "image-generation.errors";

async function optionalImport(path: string): Promise<any> {
  try { return await import(path); }
  catch { return null; }
}

const request = {
  prompt: "Realistic grocery photograph of fresh tomatoes.",
  model: "test-image-model",
  candidateCount: 2,
};

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("fake provider returns deterministic valid raster candidates without network dependencies", async () => {
  const mod = await optionalImport(fakePath);
  assert.ok(mod?.FakeImageGenerationProvider, "fake image generation provider must exist");
  const provider = new mod.FakeImageGenerationProvider();
  assert.equal(provider.id, "fake");
  const first = await provider.generate(request);
  const second = await provider.generate(request);
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.deepEqual(first.map((row: any) => digest(row.bytes)), second.map((row: any) => digest(row.bytes)));
  assert.notEqual(digest(first[0].bytes), digest(first[1].bytes));
  for (const candidate of first) {
    assert.equal(candidate.mimeType, "image/png");
    const metadata = await sharp(candidate.bytes).metadata();
    assert.ok(metadata.width && metadata.height);
  }
});

test("fake provider supports deterministic reference-image editing", async () => {
  const mod = await optionalImport(fakePath);
  assert.ok(mod?.FakeImageGenerationProvider, "fake image generation provider must exist");
  const provider = new mod.FakeImageGenerationProvider();
  const referenceImage = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 30, g: 80, b: 150 } } }).png().toBuffer();
  const edited = await provider.edit({ ...request, candidateCount: 1, referenceImage, referenceMimeType: "image/png" });
  const replay = await provider.edit({ ...request, candidateCount: 1, referenceImage, referenceMimeType: "image/png" });
  assert.equal(edited.length, 1);
  assert.equal(digest(edited[0].bytes), digest(replay[0].bytes));
  assert.equal(edited[0].mimeType, "image/png");
});

test("OpenAI adapter decodes returned image bytes and does not require a live network client in tests", async () => {
  const mod = await optionalImport(openAiPath);
  assert.ok(mod?.OpenAIImageGenerationProvider, "OpenAI image generation provider must exist");
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 220, g: 140, b: 20 } } }).png().toBuffer();
  const calls: any[] = [];
  const client = {
    images: {
      generate: async (input: any) => {
        calls.push({ kind: "generate", input });
        return { id: "req-generation", data: [{ b64_json: png.toString("base64") }] };
      },
      edit: async (input: any) => {
        calls.push({ kind: "edit", input });
        return { id: "req-edit", data: [{ b64_json: png.toString("base64") }] };
      },
    },
  };
  const provider = new mod.OpenAIImageGenerationProvider({ apiKey: "test-only", model: "gpt-image-2", timeoutMs: 5_000 }, client);
  assert.equal(provider.id, "openai");
  const generated = await provider.generate({ ...request, model: "gpt-image-2", candidateCount: 1 });
  assert.equal(generated.length, 1);
  assert.deepEqual(generated[0].bytes, png);
  assert.equal(generated[0].providerRequestId, "req-generation");
  const referenceImage = Buffer.from(png);
  const edited = await provider.edit({ ...request, model: "gpt-image-2", candidateCount: 1, referenceImage, referenceMimeType: "image/png" });
  assert.equal(edited.length, 1);
  assert.deepEqual(edited[0].bytes, png);
  assert.deepEqual(calls.map((call) => call.kind), ["generate", "edit"]);
});

test("OpenAI adapter maps provider failures into stable generation error categories", async () => {
  const providerMod = await optionalImport(openAiPath);
  const errorMod = await optionalImport(errorsPath);
  assert.ok(providerMod?.OpenAIImageGenerationProvider, "OpenAI image generation provider must exist");
  assert.ok(errorMod?.ImageGenerationProviderError, "typed generation provider error must exist");
  const cases = [
    [{ status: 429, message: "rate" }, "rate_limited"],
    [{ status: 400, code: "invalid_request_error", message: "bad input" }, "invalid_request"],
    [{ status: 400, code: "content_policy_violation", message: "policy" }, "safety_rejected"],
    [{ status: 503, message: "temporarily unavailable" }, "unavailable"],
    [{ status: 500, message: "server" }, "transient_failure"],
  ] as const;
  for (const [failure, expectedCode] of cases) {
    const client = { images: { generate: async () => { throw failure; }, edit: async () => { throw failure; } } };
    const provider = new providerMod.OpenAIImageGenerationProvider({ apiKey: "test-only", model: "gpt-image-2", timeoutMs: 5_000 }, client);
    await assert.rejects(
      () => provider.generate({ ...request, model: "gpt-image-2", candidateCount: 1 }),
      (error: any) => error instanceof errorMod.ImageGenerationProviderError && error.code === expectedCode,
    );
  }
});


test("provider registry selects only the configured fake or OpenAI adapter and stays closed when disabled", async () => {
  const registryPath = "../src/product-media/" + "image-generation.registry";
  const registry = await optionalImport(registryPath);
  assert.ok(registry?.createImageGenerationProvider, "image generation provider registry must exist");
  assert.equal(registry.createImageGenerationProvider(null), null);
  const fake = registry.createImageGenerationProvider({
    providerId: "fake",
    model: "gpt-image-2",
    timeoutMs: 5_000,
    maxCandidates: 4,
    workerPollIntervalMs: 1_000,
  });
  assert.equal(fake.id, "fake");
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  const client = {
    images: {
      generate: async () => ({ data: [{ b64_json: png.toString("base64") }] }),
      edit: async () => ({ data: [{ b64_json: png.toString("base64") }] }),
    },
  };
  const openai = registry.createImageGenerationProvider({
    providerId: "openai",
    model: "gpt-image-2",
    openAiApiKey: "server-only-test-key",
    timeoutMs: 5_000,
    maxCandidates: 4,
    workerPollIntervalMs: 1_000,
  }, client);
  assert.equal(openai.id, "openai");
});
