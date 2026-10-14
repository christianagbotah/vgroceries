import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  MAX_PRODUCT_MEDIA_BYTES,
  MAX_PRODUCT_MEDIA_DIMENSION,
  ProductMediaImageValidationError,
  validateAndNormalizeProductImage,
} from "../src/product-media/image-validation";

async function makeImage(format: "jpeg" | "png" | "webp", width = 32, height = 24) {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 34, g: 120, b: 66 } } });
  if (format === "jpeg") image = image.jpeg();
  else if (format === "png") image = image.png();
  else image = image.webp();
  return image.toBuffer();
}

test("JPEG PNG and WebP bytes are decoded and normalized deterministically to WebP", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await makeImage(format);
    const first = await validateAndNormalizeProductImage(bytes);
    const second = await validateAndNormalizeProductImage(bytes);
    assert.equal(first.mimeType, "image/webp");
    assert.equal(first.width, 32);
    assert.equal(first.height, 24);
    assert.equal(first.byteSize, first.bytes.length);
    assert.match(first.sha256, /^[a-f0-9]{64}$/);
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(first.bytes, second.bytes);
  }
});

test("invalid unsupported oversized and over-dimension images fail before publication", async () => {
  await assert.rejects(validateAndNormalizeProductImage(Buffer.from("not an image")),
    (error: unknown) => error instanceof ProductMediaImageValidationError && error.code === "CORRUPT_IMAGE");
  await assert.rejects(validateAndNormalizeProductImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')),
    (error: unknown) => error instanceof ProductMediaImageValidationError && error.code === "UNSUPPORTED_IMAGE_TYPE");
  await assert.rejects(validateAndNormalizeProductImage(Buffer.alloc(MAX_PRODUCT_MEDIA_BYTES + 1)),
    (error: unknown) => error instanceof ProductMediaImageValidationError && error.code === "IMAGE_TOO_LARGE");
  const tooWide = await makeImage("png", MAX_PRODUCT_MEDIA_DIMENSION + 1, 1);
  await assert.rejects(validateAndNormalizeProductImage(tooWide),
    (error: unknown) => error instanceof ProductMediaImageValidationError && error.code === "IMAGE_DIMENSIONS_TOO_LARGE");
});
