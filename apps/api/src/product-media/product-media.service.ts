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
