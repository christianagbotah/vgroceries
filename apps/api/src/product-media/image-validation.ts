import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_PRODUCT_MEDIA_BYTES = 12 * 1024 * 1024;
export const MAX_PRODUCT_MEDIA_DIMENSION = 6000;

export type ProductMediaImageErrorCode =
  | "IMAGE_TOO_LARGE"
  | "IMAGE_DIMENSIONS_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "CORRUPT_IMAGE";

export class ProductMediaImageValidationError extends Error {
  constructor(readonly code: ProductMediaImageErrorCode, message: string) {
    super(message);
    this.name = "ProductMediaImageValidationError";
  }
}

export interface NormalizedProductImage {
  bytes: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
}

export async function validateAndNormalizeProductImage(bytes: Buffer): Promise<NormalizedProductImage> {
  if (!bytes.length) throw new ProductMediaImageValidationError("CORRUPT_IMAGE", "The image file is empty or corrupt.");
  if (bytes.length > MAX_PRODUCT_MEDIA_BYTES)
    throw new ProductMediaImageValidationError("IMAGE_TOO_LARGE", "Product images may not exceed 12 MiB.");

  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: false })
    .metadata()
    .catch(() => {
      throw new ProductMediaImageValidationError("CORRUPT_IMAGE", "The image could not be decoded.");
    });
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format))
    throw new ProductMediaImageValidationError("UNSUPPORTED_IMAGE_TYPE", "Only JPEG, PNG and WebP product images are accepted.");
  if (!metadata.width || !metadata.height)
    throw new ProductMediaImageValidationError("CORRUPT_IMAGE", "The image dimensions could not be determined.");
  if (metadata.width > MAX_PRODUCT_MEDIA_DIMENSION || metadata.height > MAX_PRODUCT_MEDIA_DIMENSION)
    throw new ProductMediaImageValidationError("IMAGE_DIMENSIONS_TOO_LARGE", "Product images may not exceed 6000 × 6000 pixels.");
  if ((metadata.pages ?? 1) > 1)
    throw new ProductMediaImageValidationError("UNSUPPORTED_IMAGE_TYPE", "Animated product images are not supported.");

  try {
    const output = await sharp(bytes, { failOn: "error" })
      .rotate()
      .webp({ quality: 88, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (output.data.length > MAX_PRODUCT_MEDIA_BYTES)
      throw new ProductMediaImageValidationError("IMAGE_TOO_LARGE", "The normalized product image exceeds 12 MiB.");
    return {
      bytes: output.data,
      mimeType: "image/webp",
      width: output.info.width,
      height: output.info.height,
      byteSize: output.data.length,
      sha256: createHash("sha256").update(output.data).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ProductMediaImageValidationError) throw error;
    throw new ProductMediaImageValidationError("CORRUPT_IMAGE", "The image could not be normalized safely.");
  }
}
