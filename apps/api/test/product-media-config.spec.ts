import test from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";

const baseEnv = {
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  API_STOCK_LOCATION_ID: "loc_accra",
  WEB_ORIGINS: "http://localhost:3000",
};

const filesystem = {
  PRODUCT_MEDIA_STORAGE: "filesystem",
  PRODUCT_MEDIA_FILESYSTEM_ROOT: "/srv/variety/product-media",
  PRODUCT_MEDIA_PUBLIC_BASE_URL: "https://media.example.test/products/",
};

const s3 = {
  PRODUCT_MEDIA_STORAGE: "s3",
  PRODUCT_MEDIA_S3_ENDPOINT: "https://s3.example.test",
  PRODUCT_MEDIA_S3_REGION: "auto",
  PRODUCT_MEDIA_S3_BUCKET: "variety-products",
  PRODUCT_MEDIA_S3_ACCESS_KEY_ID: "access-test",
  PRODUCT_MEDIA_S3_SECRET_ACCESS_KEY: "secret-test",
  PRODUCT_MEDIA_PUBLIC_BASE_URL: "https://cdn.example.test/products/",
};

test("product media and generation are disabled when their bundles are absent", () => {
  const config = readConfig(baseEnv);
  assert.equal(config.productMedia, null);
  assert.equal(config.imageGeneration, null);
});

test("filesystem product-media configuration is explicit and stable outside releases", () => {
  const config = readConfig({ ...baseEnv, ...filesystem });
  assert.deepEqual(config.productMedia, {
    kind: "filesystem",
    root: "/srv/variety/product-media",
    publicBaseUrl: "https://media.example.test/products/",
  });
  assert.equal(config.imageGeneration, null);
  assert.throws(
    () => readConfig({ ...baseEnv, PRODUCT_MEDIA_STORAGE: "filesystem" }),
    /filesystem.*bundle/i,
  );
});

test("S3-compatible product-media configuration requires the complete secret server bundle", () => {
  const config = readConfig({ ...baseEnv, ...s3 }).productMedia!;
  assert.equal(config.kind, "s3");
  if (config.kind !== "s3") throw new Error("expected s3 configuration");
  assert.equal(config.endpoint, "https://s3.example.test");
  assert.equal(config.region, "auto");
  assert.equal(config.bucket, "variety-products");
  assert.equal(config.accessKeyId, "access-test");
  assert.equal(config.secretAccessKey, "secret-test");
  assert.equal(config.publicBaseUrl, "https://cdn.example.test/products/");
  assert.throws(
    () => readConfig({ ...baseEnv, ...s3, PRODUCT_MEDIA_S3_BUCKET: "" }),
    /S3.*bundle/i,
  );
});

test("fake AI provider uses bounded defaults and OpenAI requires a server key", () => {
  const fake = readConfig({ ...baseEnv, ...filesystem, AI_IMAGE_PROVIDER: "fake" }).imageGeneration!;
  assert.equal(fake.providerId, "fake");
  assert.equal(fake.model, "gpt-image-2");
  assert.equal(fake.timeoutMs, 60_000);
  assert.equal(fake.maxCandidates, 4);
  assert.equal(fake.workerPollIntervalMs, 2_000);
  assert.equal(fake.openAiApiKey, undefined);

  assert.throws(
    () => readConfig({ ...baseEnv, ...filesystem, AI_IMAGE_PROVIDER: "openai" }),
    /OPENAI_API_KEY/,
  );
  const openai = readConfig({
    ...baseEnv,
    ...filesystem,
    AI_IMAGE_PROVIDER: "openai",
    OPENAI_API_KEY: "test-server-key",
  }).imageGeneration!;
  assert.equal(openai.providerId, "openai");
  assert.equal(openai.model, "gpt-image-2");
  assert.equal(openai.openAiApiKey, "test-server-key");
});

test("generation bounds reject unsafe or nonsensical values and partial AI config", () => {
  const valid = { ...baseEnv, ...filesystem, AI_IMAGE_PROVIDER: "fake" };
  assert.throws(() => readConfig({ ...valid, AI_IMAGE_MAX_CANDIDATES: "0" }), /AI_IMAGE_MAX_CANDIDATES/);
  assert.throws(() => readConfig({ ...valid, AI_IMAGE_MAX_CANDIDATES: "5" }), /AI_IMAGE_MAX_CANDIDATES/);
  assert.throws(() => readConfig({ ...valid, AI_IMAGE_TIMEOUT_MS: "999" }), /AI_IMAGE_TIMEOUT_MS/);
  assert.throws(() => readConfig({ ...valid, AI_IMAGE_TIMEOUT_MS: "120001" }), /AI_IMAGE_TIMEOUT_MS/);
  assert.throws(() => readConfig({ ...valid, AI_IMAGE_WORKER_POLL_MS: "99" }), /AI_IMAGE_WORKER_POLL_MS/);
  assert.throws(
    () => readConfig({ ...baseEnv, ...filesystem, AI_IMAGE_MODEL: "gpt-image-2" }),
    /AI_IMAGE_PROVIDER/,
  );
  assert.throws(
    () => readConfig({ ...baseEnv, AI_IMAGE_PROVIDER: "fake" }),
    /PRODUCT_MEDIA_STORAGE/,
  );
});
