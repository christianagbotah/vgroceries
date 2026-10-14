import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ProductMedia } from "@prisma/client";
import type {
  AdminProductMediaView,
  ImageGenerationJobView,
  ProductBrandMode,
  ProductMediaSource,
  ProductMediaStatus,
  ProductMediaView,
} from "@variety/contracts";
import { basename } from "node:path";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { validateAndNormalizeProductImage, ProductMediaImageValidationError } from "./image-validation";
import { PRODUCT_MEDIA_STORAGE } from "./product-media.provider";
import type { ProductMediaStorage } from "./product-media.storage";
import { ProductMediaStorageError } from "./product-media.storage";
import { createProductMediaStorageKey } from "./storage-key";

@Injectable()
export class ProductMediaService {
  constructor(
    private readonly db: Database,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage | null,
  ) {}

  private requireStorage(): ProductMediaStorage {
    if (!this.storage)
      throw new ApiProblem(503, "PRODUCT_MEDIA_UNAVAILABLE", "Product media storage is not configured.");
    return this.storage;
  }

  private mediaView(row: ProductMedia): ProductMediaView {
    return {
      id: row.id,
      productId: row.productId,
      source: row.source as ProductMediaSource,
      status: row.status as ProductMediaStatus,
      previewUrl: row.publicUrl ?? `/api/v1/admin/catalog/media/${row.id}/content`,
      ...(row.publicUrl ? { publicUrl: row.publicUrl } : {}),
      mimeType: row.mimeType as ProductMediaView["mimeType"],
      width: row.width,
      height: row.height,
      byteSize: row.byteSize,
      sha256: row.sha256,
      altText: row.altText,
      ...(row.galleryOrder === null ? {} : { galleryOrder: row.galleryOrder }),
      ...(row.originalFilename ? { originalFilename: row.originalFilename } : {}),
      ...(row.generationJobId ? { generationJobId: row.generationJobId } : {}),
      createdBy: row.createdBy,
      ...(row.approvedBy ? { approvedBy: row.approvedBy } : {}),
      ...(row.approvedAt ? { approvedAt: row.approvedAt.toISOString() } : {}),
      ...(row.rejectedAt ? { rejectedAt: row.rejectedAt.toISOString() } : {}),
      ...(row.archivedAt ? { archivedAt: row.archivedAt.toISOString() } : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async lockProductMedia(tx: Prisma.TransactionClient, productId: string) {
    const products = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Product" WHERE id=${productId} FOR UPDATE
    `;
    if (!products.length) throw new ApiProblem(404, "PRODUCT_NOT_FOUND", "Product not found.");
    await tx.$queryRaw`
      SELECT id FROM "ProductMedia" WHERE "productId"=${productId} ORDER BY id FOR UPDATE
    `;
  }

  private async compactGallery(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.productMedia.findMany({
      where: { productId, status: "approved", archivedAt: null, galleryOrder: { not: null } },
      orderBy: [{ galleryOrder: "asc" }, { id: "asc" }],
      select: { id: true, galleryOrder: true },
    });
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index].galleryOrder !== index)
        await tx.productMedia.update({ where: { id: rows[index].id }, data: { galleryOrder: index } });
    }
  }

  private async cleanupUnreferenced(storageKey: string) {
    const storage = this.requireStorage();
    try {
      if (await this.db.productMedia.count({ where: { storageKey } }) === 0)
        await storage.delete(storageKey);
    } catch (error) {
      console.error(JSON.stringify({
        event: "product_media.cleanup_failed",
        storageKey,
        errorType: error instanceof Error ? error.name : "unknown",
      }));
    }
  }

  async viewProductMedia(productId: string): Promise<AdminProductMediaView> {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      include: {
        media: { orderBy: [{ galleryOrder: "asc" }, { createdAt: "desc" }] },
        generationJobs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { candidates: { select: { id: true } } },
        },
      },
    });
    if (!product) throw new ApiProblem(404, "PRODUCT_NOT_FOUND", "Product not found.");

    const featured = product.featuredMediaId
      ? product.media.find((row) => row.id === product.featuredMediaId && row.status === "approved")
      : undefined;
    const approvedGallery = product.media
      .filter((row) => row.status === "approved" && row.archivedAt === null && row.galleryOrder !== null)
      .sort((a, b) => (a.galleryOrder ?? 0) - (b.galleryOrder ?? 0))
      .map((row) => this.mediaView(row));
    const reviewCandidates = product.media
      .filter((row) => row.status === "draft" || row.status === "ready_for_review")
      .map((row) => this.mediaView(row));
    const jobs: ImageGenerationJobView[] = product.generationJobs.map((job) => ({
      id: job.id,
      productId: job.productId,
      requestedBy: job.requestedBy,
      mode: job.mode as ImageGenerationJobView["mode"],
      stylePreset: job.stylePreset as ImageGenerationJobView["stylePreset"],
      status: job.status as ImageGenerationJobView["status"],
      provider: job.provider,
      model: job.model,
      candidateCount: job.candidateCount,
      attemptCount: job.attemptCount,
      ...(job.referenceMediaId ? { referenceMediaId: job.referenceMediaId } : {}),
      candidateMediaIds: job.candidates.map((row) => row.id),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
      ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}),
      ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));
    const brandMode = product.brandMode as ProductBrandMode;
    return {
      productId,
      brandMode,
      resolvedBrandMode: brandMode === "branded" ? "branded" : "unbranded",
      ...(featured ? { featuredMedia: this.mediaView(featured) } : {}),
      approvedGallery,
      reviewCandidates,
      generationJobs: jobs,
    };
  }

  async ingestUpload(input: {
    productId: string;
    actorId: string;
    requestId: string;
    originalFilename: string;
    altText: string;
    bytes: Buffer;
  }): Promise<ProductMediaView> {
    const storage = this.requireStorage();
    const product = await this.db.product.findUnique({ where: { id: input.productId }, select: { id: true } });
    if (!product) throw new ApiProblem(404, "PRODUCT_NOT_FOUND", "Product not found.");

    let normalized;
    try {
      normalized = await validateAndNormalizeProductImage(input.bytes);
    } catch (error) {
      if (error instanceof ProductMediaImageValidationError) {
        const status = error.code === "IMAGE_TOO_LARGE" ? 413 : 400;
        throw new ApiProblem(status, error.code, error.message);
      }
      throw error;
    }

    const storageKey = createProductMediaStorageKey(input.productId, normalized.sha256, "private");
    await storage.put({
      key: storageKey,
      bytes: normalized.bytes,
      contentType: normalized.mimeType,
      visibility: "private",
    });

    try {
      const row = await this.db.$transaction(async (tx) => {
        const media = await tx.productMedia.create({
          data: {
            productId: input.productId,
            source: "upload",
            status: "ready_for_review",
            storageKey,
            publicUrl: null,
            mimeType: normalized.mimeType,
            width: normalized.width,
            height: normalized.height,
            byteSize: normalized.byteSize,
            sha256: normalized.sha256,
            altText: input.altText.trim().slice(0, 1000),
            originalFilename: basename(input.originalFilename).slice(0, 255),
            createdBy: input.actorId,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: input.actorId,
            action: "media.uploaded",
            entityId: media.id,
            requestId: input.requestId,
            details: {
              productId: input.productId,
              source: "upload",
              mimeType: normalized.mimeType,
              width: normalized.width,
              height: normalized.height,
              byteSize: normalized.byteSize,
              sha256: normalized.sha256,
            },
          },
        });
        return media;
      });
      return this.mediaView(row);
    } catch (error) {
      try {
        const references = await this.db.productMedia.count({ where: { storageKey } });
        if (references === 0) await storage.delete(storageKey);
      } catch (cleanupError) {
        console.error(JSON.stringify({ event: "product_media.compensation_failed", storageKey, errorType: cleanupError instanceof Error ? cleanupError.name : "unknown" }));
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ApiProblem(409, "MEDIA_DUPLICATE", "This image is already attached to the product.");
      throw error;
    }
  }

  async approve(mediaId: string, actorId: string, requestId: string): Promise<ProductMediaView> {
    const storage = this.requireStorage();
    const seed = await this.db.productMedia.findUnique({ where: { id: mediaId } });
    if (!seed) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
    if (seed.status === "approved" && seed.archivedAt === null) return this.mediaView(seed);
    if (!["draft", "ready_for_review"].includes(seed.status))
      throw new ApiProblem(409, "MEDIA_STATE_INVALID", "Only review candidates can be approved.");

    let bytes: Buffer;
    try { bytes = await storage.read(seed.storageKey); }
    catch (error) {
      if (error instanceof ProductMediaStorageError && error.code === "STORAGE_NOT_FOUND")
        throw new ApiProblem(409, "MEDIA_CONTENT_NOT_FOUND", "The review candidate content is missing.");
      throw new ApiProblem(503, "PRODUCT_MEDIA_UNAVAILABLE", "Product media storage is temporarily unavailable.");
    }
    const publicKey = createProductMediaStorageKey(seed.productId, seed.sha256, "public");
    let stored;
    try {
      stored = await storage.put({ key: publicKey, bytes, contentType: seed.mimeType as ProductMediaView["mimeType"], visibility: "public" });
    } catch (error) {
      if (error instanceof ProductMediaStorageError && error.code === "STORAGE_KEY_CONFLICT")
        throw new ApiProblem(409, "MEDIA_STORAGE_CONFLICT", "The approved media object conflicts with existing storage.");
      throw new ApiProblem(503, "PRODUCT_MEDIA_UNAVAILABLE", "Product media storage is temporarily unavailable.");
    }

    try {
      const row = await this.db.$transaction(async (tx) => {
        await this.lockProductMedia(tx, seed.productId);
        const current = await tx.productMedia.findUnique({ where: { id: mediaId } });
        if (!current) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
        if (current.status === "approved" && current.archivedAt === null) return current;
        if (!["draft", "ready_for_review"].includes(current.status) || current.storageKey !== seed.storageKey)
          throw new ApiProblem(409, "MEDIA_STATE_INVALID", "The review candidate changed before approval.");
        const approvedAt = new Date();
        const media = await tx.productMedia.update({
          where: { id: mediaId },
          data: {
            status: "approved",
            storageKey: publicKey,
            publicUrl: stored.publicUrl ?? storage.publicUrl(publicKey),
            approvedBy: actorId,
            approvedAt,
            rejectedAt: null,
            archivedAt: null,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: "media.approved",
            entityId: mediaId,
            requestId,
            details: { productId: seed.productId, beforeStatus: current.status, publicStorageKey: publicKey },
          },
        });
        return media;
      });
      if (row.storageKey === publicKey && seed.storageKey !== publicKey)
        await this.cleanupUnreferenced(seed.storageKey);
      return this.mediaView(row);
    } catch (error) {
      await this.cleanupUnreferenced(publicKey);
      throw error;
    }
  }

  async reject(mediaId: string, actorId: string, requestId: string): Promise<ProductMediaView> {
    const seed = await this.db.productMedia.findUnique({ where: { id: mediaId }, select: { productId: true } });
    if (!seed) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
    const row = await this.db.$transaction(async (tx) => {
      await this.lockProductMedia(tx, seed.productId);
      const current = await tx.productMedia.findUnique({ where: { id: mediaId } });
      if (!current) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
      if (current.status === "rejected") return current;
      if (!["draft", "ready_for_review"].includes(current.status))
        throw new ApiProblem(409, "MEDIA_STATE_INVALID", "Only review candidates can be rejected.");
      const media = await tx.productMedia.update({
        where: { id: mediaId },
        data: { status: "rejected", rejectedAt: new Date(), galleryOrder: null },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "media.rejected",
          entityId: mediaId,
          requestId,
          details: { productId: seed.productId, beforeStatus: current.status },
        },
      });
      return media;
    });
    return this.mediaView(row);
  }

  async setFeatured(productId: string, mediaId: string | null, actorId: string, requestId: string): Promise<AdminProductMediaView> {
    await this.db.$transaction(async (tx) => {
      await this.lockProductMedia(tx, productId);
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      if (mediaId !== null) {
        const media = await tx.productMedia.findFirst({ where: { id: mediaId, productId } });
        if (!media) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
        if (media.status !== "approved" || media.archivedAt !== null)
          throw new ApiProblem(409, "MEDIA_NOT_APPROVED", "Only approved active media can be featured.");
      }
      if (product.featuredMediaId === mediaId) return;
      await tx.product.update({ where: { id: productId }, data: { featuredMediaId: mediaId } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "media.featured.changed",
          entityId: productId,
          requestId,
          details: { beforeMediaId: product.featuredMediaId, afterMediaId: mediaId },
        },
      });
    });
    return this.viewProductMedia(productId);
  }

  async reorderGallery(productId: string, orderedMediaIds: string[], actorId: string, requestId: string): Promise<AdminProductMediaView> {
    await this.db.$transaction(async (tx) => {
      await this.lockProductMedia(tx, productId);
      const media = orderedMediaIds.length
        ? await tx.productMedia.findMany({ where: { productId, id: { in: orderedMediaIds } } })
        : [];
      if (media.length !== orderedMediaIds.length)
        throw new ApiProblem(404, "MEDIA_NOT_FOUND", "One or more product media items were not found.");
      if (media.some((row) => row.status !== "approved" || row.archivedAt !== null))
        throw new ApiProblem(409, "MEDIA_NOT_APPROVED", "Only approved active media can be placed in the gallery.");
      await tx.productMedia.updateMany({
        where: { productId, galleryOrder: { not: null } },
        data: { galleryOrder: null },
      });
      for (let index = 0; index < orderedMediaIds.length; index += 1)
        await tx.productMedia.update({ where: { id: orderedMediaIds[index] }, data: { galleryOrder: index } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "media.gallery.reordered",
          entityId: productId,
          requestId,
          details: { orderedMediaIds },
        },
      });
    });
    return this.viewProductMedia(productId);
  }

  async archive(
    mediaId: string,
    actorId: string,
    requestId: string,
    replacementFeaturedMediaId?: string | null,
  ): Promise<ProductMediaView> {
    const seed = await this.db.productMedia.findUnique({ where: { id: mediaId }, select: { productId: true } });
    if (!seed) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
    const row = await this.db.$transaction(async (tx) => {
      await this.lockProductMedia(tx, seed.productId);
      const product = await tx.product.findUniqueOrThrow({ where: { id: seed.productId } });
      const current = await tx.productMedia.findUnique({ where: { id: mediaId } });
      if (!current) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
      if (current.status === "archived") return current;

      if (product.featuredMediaId === mediaId) {
        if (replacementFeaturedMediaId === undefined)
          throw new ApiProblem(409, "FEATURED_REPLACEMENT_REQUIRED", "Choose a replacement featured image or explicitly remove the featured image first.");
        if (replacementFeaturedMediaId !== null) {
          if (replacementFeaturedMediaId === mediaId)
            throw new ApiProblem(409, "FEATURED_REPLACEMENT_INVALID", "The archived image cannot replace itself.");
          const replacement = await tx.productMedia.findFirst({ where: { id: replacementFeaturedMediaId, productId: seed.productId } });
          if (!replacement) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Replacement product media not found.");
          if (replacement.status !== "approved" || replacement.archivedAt !== null)
            throw new ApiProblem(409, "MEDIA_NOT_APPROVED", "Replacement featured media must be approved and active.");
        }
        await tx.product.update({ where: { id: seed.productId }, data: { featuredMediaId: replacementFeaturedMediaId } });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: "media.featured.changed",
            entityId: seed.productId,
            requestId,
            details: { beforeMediaId: mediaId, afterMediaId: replacementFeaturedMediaId },
          },
        });
      }

      const archived = await tx.productMedia.update({
        where: { id: mediaId },
        data: { status: "archived", archivedAt: new Date(), galleryOrder: null },
      });
      await this.compactGallery(tx, seed.productId);
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "media.archived",
          entityId: mediaId,
          requestId,
          details: { productId: seed.productId, beforeStatus: current.status },
        },
      });
      return archived;
    });
    return this.mediaView(row);
  }

  async setBrandMode(productId: string, brandMode: ProductBrandMode, actorId: string, requestId: string): Promise<AdminProductMediaView> {
    await this.db.$transaction(async (tx) => {
      const products = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Product" WHERE id=${productId} FOR UPDATE
      `;
      if (!products.length) throw new ApiProblem(404, "PRODUCT_NOT_FOUND", "Product not found.");
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      if (product.brandMode === brandMode) return;
      await tx.product.update({ where: { id: productId }, data: { brandMode } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "product.brand_mode.overridden",
          entityId: productId,
          requestId,
          details: { beforeBrandMode: product.brandMode, afterBrandMode: brandMode },
        },
      });
    });
    return this.viewProductMedia(productId);
  }

  async readContent(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const storage = this.requireStorage();
    const media = await this.db.productMedia.findUnique({ where: { id: mediaId } });
    if (!media) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Product media not found.");
    try {
      return { bytes: await storage.read(media.storageKey), mimeType: media.mimeType };
    } catch (error) {
      if (error instanceof ProductMediaStorageError && error.code === "STORAGE_NOT_FOUND")
        throw new ApiProblem(404, "MEDIA_CONTENT_NOT_FOUND", "Product media content not found.");
      throw new ApiProblem(503, "PRODUCT_MEDIA_UNAVAILABLE", "Product media storage is temporarily unavailable.");
    }
  }
}
