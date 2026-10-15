import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { Database } from "../src/database/database";
import { readConfig, type ApiConfig } from "../src/config";
import { FilesystemProductMediaStorage } from "../src/product-media/filesystem-product-media.storage";
import { S3ProductMediaStorage } from "../src/product-media/s3-product-media.storage";
import type { ProductMediaStorage } from "../src/product-media/product-media.storage";
import { validateAndNormalizeProductImage } from "../src/product-media/image-validation";
import { createProductMediaStorageKey } from "../src/product-media/storage-key";

export type LegacyMediaReviewPolicy = "draft" | "approve";

export interface LegacyProductImage {
  id: string;
  image: string;
}

export interface PlannedLegacyProductMediaImport {
  productId: string;
  sourcePath: string;
  source: "legacy_import";
  status: "draft" | "approved";
  visibility: "private" | "public";
}

export function planLegacyProductMediaImport(
  products: LegacyProductImage[],
  options: { legacyPublicRoot: string; reviewPolicy?: LegacyMediaReviewPolicy },
): PlannedLegacyProductMediaImport[] {
  const root = resolve(options.legacyPublicRoot);
  const reviewPolicy = options.reviewPolicy ?? "draft";
  if (reviewPolicy !== "draft" && reviewPolicy !== "approve")
    throw new Error("Legacy media review policy must be draft or approve.");

  return products.flatMap((product) => {
    const raw = product.image.trim();
    if (
      !raw ||
      raw.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
      raw.includes("\\")
    )
      return [];

    const withoutQuery = raw.split(/[?#]/, 1)[0];
    const relative = withoutQuery.replace(/^\/+/, "");
    if (
      !relative ||
      relative.split("/").some((segment) => segment === ".." || segment === ".") ||
      !/\.(?:jpe?g|png|webp)$/i.test(relative)
    )
      return [];

    const sourcePath = resolve(root, relative);
    if (sourcePath === root || !sourcePath.startsWith(root + sep)) return [];

    return [{
      productId: product.id,
      sourcePath,
      source: "legacy_import" as const,
      status: reviewPolicy === "approve" ? "approved" as const : "draft" as const,
      visibility: reviewPolicy === "approve" ? "public" as const : "private" as const,
    }];
  });
}

function createStorage(config: ApiConfig): ProductMediaStorage {
  if (!config.productMedia)
    throw new Error("Product media storage must be configured before legacy media import.");
  if (config.productMedia.kind === "filesystem")
    return new FilesystemProductMediaStorage(
      config.productMedia.root,
      config.productMedia.publicBaseUrl,
    );
  return new S3ProductMediaStorage(config.productMedia);
}

export async function importLegacyProductMediaItem(input: {
  db: Database;
  storage: ProductMediaStorage;
  product: { id: string; name: string; image: string };
  plan: PlannedLegacyProductMediaImport;
  actorId: string;
  readSource?: (path: string) => Promise<Buffer>;
  normalize?: typeof validateAndNormalizeProductImage;
}): Promise<"imported" | "existing" | "missing"> {
  let sourceBytes: Buffer;
  try {
    sourceBytes = await (input.readSource ?? readFile)(input.plan.sourcePath);
  } catch (error: any) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }

  const normalized = await (input.normalize ?? validateAndNormalizeProductImage)(sourceBytes);
  const existing = await input.db.productMedia.findFirst({
    where: {
      productId: input.product.id,
      source: "legacy_import",
      sha256: normalized.sha256,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (existing) return "existing";

  const storageKey = createProductMediaStorageKey(
    input.product.id,
    normalized.sha256,
    input.plan.visibility,
  );
  const stored = await input.storage.put({
    key: storageKey,
    bytes: normalized.bytes,
    contentType: normalized.mimeType,
    visibility: input.plan.visibility,
  });

  try {
    const transactionResult = await input.db.$transaction(async (tx) => {
      const duplicate = await tx.productMedia.findFirst({
        where: {
          productId: input.product.id,
          source: "legacy_import",
          sha256: normalized.sha256,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) return "existing" as const;

      const approvedAt = input.plan.status === "approved" ? new Date() : null;
      const media = await tx.productMedia.create({
        data: {
          productId: input.product.id,
          source: "legacy_import",
          status: input.plan.status,
          storageKey,
          publicUrl:
            input.plan.visibility === "public"
              ? stored.publicUrl ?? input.storage.publicUrl(storageKey)
              : null,
          mimeType: normalized.mimeType,
          width: normalized.width,
          height: normalized.height,
          byteSize: normalized.byteSize,
          sha256: normalized.sha256,
          altText: input.product.name.slice(0, 1000),
          originalFilename: basename(input.plan.sourcePath).slice(0, 255),
          createdBy: input.actorId,
          ...(approvedAt
            ? {
                approvedBy: input.actorId,
                approvedAt,
              }
            : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: input.actorId,
          action: "media.legacy_imported",
          entityId: media.id,
          requestId: randomUUID(),
          details: {
            productId: input.product.id,
            originalImage: input.product.image,
            reviewPolicy: input.plan.status === "approved" ? "approve" : "draft",
            sha256: normalized.sha256,
          },
        },
      });
      return "imported" as const;
    });

    if (transactionResult === "existing") {
      const references = await input.db.productMedia
        .count({ where: { storageKey } })
        .catch(() => 1);
      if (references === 0) await input.storage.delete(storageKey);
      return "existing";
    }

    return "imported";
  } catch (error) {
    const references = await input.db.productMedia.count({ where: { storageKey } }).catch(() => 1);
    if (references === 0) await input.storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

async function main() {
  const config = readConfig();
  const storage = createStorage(config);
  const db = new Database(config);
  const legacyPublicRoot = resolve(
    process.env.LEGACY_PRODUCT_MEDIA_ROOT ?? resolve(process.cwd(), "../..", "public"),
  );
  const rawPolicy = process.env.LEGACY_PRODUCT_MEDIA_REVIEW_POLICY ?? "draft";
  if (rawPolicy !== "draft" && rawPolicy !== "approve")
    throw new Error("LEGACY_PRODUCT_MEDIA_REVIEW_POLICY must be draft or approve.");
  const reviewPolicy = rawPolicy as LegacyMediaReviewPolicy;
  const actorId = process.env.LEGACY_PRODUCT_MEDIA_ACTOR_ID?.trim() || "legacy-media-import";

  await db.$connect();
  try {
    const products = await db.product.findMany({
      where: { NOT: { image: "" } },
      select: { id: true, name: true, image: true },
      orderBy: { id: "asc" },
    });
    const plan = planLegacyProductMediaImport(products, {
      legacyPublicRoot,
      reviewPolicy,
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const summary = {
      discovered: products.length,
      planned: plan.length,
      imported: 0,
      existing: 0,
      missing: 0,
      skippedExternalOrUnsafe: products.length - plan.length,
      reviewPolicy,
    };

    for (const item of plan) {
      const product = productById.get(item.productId);
      if (!product) continue;
      const result = await importLegacyProductMediaItem({ db, storage, product, plan: item, actorId });
      summary[result] += 1;
    }

    console.log(JSON.stringify({ event: "product_media.legacy_import.completed", ...summary }));
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "product_media.legacy_import.failed",
        errorType: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "Legacy product media import failed.",
      }),
    );
    process.exitCode = 1;
  });
}
