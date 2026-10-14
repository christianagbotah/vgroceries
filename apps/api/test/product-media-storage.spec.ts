import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemProductMediaStorage } from "../src/product-media/filesystem-product-media.storage";
import { S3ProductMediaStorage } from "../src/product-media/s3-product-media.storage";
import { createProductMediaStorageKey } from "../src/product-media/storage-key";

const digest = "a".repeat(64);

test("storage keys are immutable namespace-scoped and traversal-safe", () => {
  assert.equal(createProductMediaStorageKey("product-1", digest, "private"), `private/product-1/aa/${digest}.webp`);
  assert.equal(createProductMediaStorageKey("product-1", digest, "public"), `public/product-1/aa/${digest}.webp`);
  for (const productId of ["../escape", "a/b", "", "."])
    assert.throws(() => createProductMediaStorageKey(productId, digest, "private"));
  assert.throws(() => createProductMediaStorageKey("product-1", "bad", "private"));
});

test("filesystem storage isolates private candidates and serves only public keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "vg-media-"));
  try {
    const storage = new FilesystemProductMediaStorage(root, "https://media.example.test/products/");
    const privateKey = createProductMediaStorageKey("product-1", digest, "private");
    const publicKey = createProductMediaStorageKey("product-1", digest, "public");
    const bytes = Buffer.from("verified-image-bytes");
    await storage.put({ key: privateKey, bytes, contentType: "image/webp", visibility: "private" });
    assert.equal(await storage.exists(privateKey), true);
    assert.deepEqual(await storage.read(privateKey), bytes);
    assert.throws(() => storage.publicUrl(privateKey), /private/i);
    await storage.put({ key: publicKey, bytes, contentType: "image/webp", visibility: "public" });
    assert.equal(storage.publicUrl(publicKey), `https://media.example.test/products/product-1/aa/${digest}.webp`);
    for (const key of ["../escape.webp", "/absolute.webp", "public/../private/file.webp"])
      await assert.rejects(storage.exists(key), /storage key/i);
    await storage.delete(privateKey);
    assert.equal(await storage.exists(privateKey), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("S3 storage uses the same private/public namespace and public URL contract", () => {
  const storage = new S3ProductMediaStorage({
    endpoint: "https://s3.example.test",
    region: "auto",
    bucket: "variety-products",
    accessKeyId: "test-access",
    secretAccessKey: "test-secret",
    publicBaseUrl: "https://cdn.example.test/products/",
  }, { send: async () => ({}) } as never);
  const privateKey = createProductMediaStorageKey("product-9", digest, "private");
  const publicKey = createProductMediaStorageKey("product-9", digest, "public");
  assert.throws(() => storage.publicUrl(privateKey), /private/i);
  assert.equal(storage.publicUrl(publicKey), `https://cdn.example.test/products/product-9/aa/${digest}.webp`);
});
