import { Inject, Injectable } from "@nestjs/common";
import type { ImageGenerationJob } from "@prisma/client";
import { Database } from "../database/database";
import { ImageGenerationProviderError, normalizeImageGenerationError } from "./image-generation.errors";
import type { ImageGenerationProvider } from "./image-generation.provider";
import { validateAndNormalizeProductImage, ProductMediaImageValidationError } from "./image-validation";
import { PRODUCT_MEDIA_STORAGE } from "./product-media.provider";
import { ProductMediaStorageError, type ProductMediaStorage } from "./product-media.storage";
import { createProductMediaStorageKey } from "./storage-key";

export const IMAGE_GENERATION_PROVIDER = Symbol("IMAGE_GENERATION_PROVIDER");
const MAX_ATTEMPTS = 3;

type Failure = {
  code: string;
  message: string;
  retryable: boolean;
};

type StoredCandidate = {
  storageKey: string;
  mimeType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  providerRequestId?: string;
};

function safeMessage(message: string): string {
  return message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500) || "Image generation failed.";
}

@Injectable()
export class GenerationWorkerService {
  constructor(
    private readonly db: Database,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage | null,
    @Inject(IMAGE_GENERATION_PROVIDER) private readonly provider: ImageGenerationProvider | null,
  ) {}

  async claimNextJob(): Promise<ImageGenerationJob | null> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "ImageGenerationJob"
        WHERE status='queued'
        ORDER BY "createdAt" ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const id = rows[0]?.id;
      if (!id) return null;
      return tx.imageGenerationJob.update({
        where: { id },
        data: {
          status: "generating",
          attemptCount: { increment: 1 },
          startedAt: new Date(),
          completedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    });
  }

  private requireRuntime(job: ImageGenerationJob): { storage: ProductMediaStorage; provider: ImageGenerationProvider } {
    if (!this.storage)
      throw new ProductMediaStorageError("STORAGE_UNAVAILABLE", "Product media storage is unavailable.");
    if (!this.provider || this.provider.id !== job.provider)
      throw new ImageGenerationProviderError("unavailable", "The configured image provider cannot process this queued job.");
    return { storage: this.storage, provider: this.provider };
  }

  private classify(error: unknown, stage: "provider" | "storage" | "validation" | "database"): Failure {
    if (stage === "provider") {
      const normalized = normalizeImageGenerationError(error);
      return { code: normalized.code, message: safeMessage(normalized.message), retryable: normalized.retryable };
    }
    if (stage === "storage") {
      const message = error instanceof Error ? error.message : "Product media storage failed.";
      return { code: "storage_unavailable", message: safeMessage(message), retryable: true };
    }
    if (stage === "validation") {
      const code = error instanceof ProductMediaImageValidationError ? error.code.toLowerCase() : "invalid_provider_output";
      const message = error instanceof Error ? error.message : "The generated image could not be validated.";
      return { code, message: safeMessage(message), retryable: false };
    }
    const message = error instanceof Error ? error.message : "Generated media could not be persisted.";
    return { code: "persistence_failed", message: safeMessage(message), retryable: false };
  }

  private async recordFailure(jobId: string, failure: Failure): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ImageGenerationJob" WHERE id=${jobId} FOR UPDATE`;
      const current = await tx.imageGenerationJob.findUnique({ where: { id: jobId } });
      if (!current || current.status === "succeeded" || current.status === "failed") return;
      const terminal = !failure.retryable || current.attemptCount >= MAX_ATTEMPTS;
      await tx.imageGenerationJob.update({
        where: { id: jobId },
        data: {
          status: terminal ? "failed" : "queued",
          errorCode: failure.code,
          errorMessage: failure.message,
          completedAt: terminal ? new Date() : null,
        },
      });
      if (terminal) {
        await tx.auditEvent.create({
          data: {
            actorId: current.requestedBy,
            action: "media.generation.failed",
            entityId: current.id,
            requestId: `media-worker:${current.id}:${current.attemptCount}`,
            details: {
              productId: current.productId,
              provider: current.provider,
              model: current.model,
              attemptCount: current.attemptCount,
              errorCode: failure.code,
            },
          },
        });
      }
    });
    console.log(JSON.stringify({ event: "media.generation.failed", jobId, errorCode: failure.code, retryable: failure.retryable }));
  }

  private async compensate(storage: ProductMediaStorage, keys: string[]): Promise<void> {
    for (const key of [...new Set(keys)]) {
      try {
        const references = await this.db.productMedia.count({ where: { storageKey: key } });
        if (references === 0) await storage.delete(key);
      } catch (error) {
        console.error(JSON.stringify({ event: "media.generation.compensation_failed", storageKey: key, errorType: error instanceof Error ? error.name : "unknown" }));
      }
    }
  }

  async processJob(jobId: string): Promise<void> {
    const started = Date.now();
    const job = await this.db.imageGenerationJob.findUnique({
      where: { id: jobId },
      include: { product: true, referenceMedia: true, candidates: { select: { id: true } } },
    });
    if (!job || job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return;
    if (job.status !== "generating") return;

    let runtime: { storage: ProductMediaStorage; provider: ImageGenerationProvider };
    try {
      runtime = this.requireRuntime(job);
    } catch (error) {
      const stage = error instanceof ProductMediaStorageError ? "storage" : "provider";
      await this.recordFailure(job.id, this.classify(error, stage));
      return;
    }

    const request = { prompt: job.prompt, model: job.model, candidateCount: job.candidateCount };
    let generated;
    try {
      if (job.mode === "branded_packshot_edit") {
        if (!job.referenceMedia)
          throw new ImageGenerationProviderError("invalid_request", "The genuine reference image is missing.");
        let referenceImage: Buffer;
        try {
          referenceImage = await runtime.storage.read(job.referenceMedia.storageKey);
        } catch (error) {
          await this.recordFailure(job.id, this.classify(error, "storage"));
          return;
        }
        generated = await runtime.provider.edit({
          ...request,
          referenceImage,
          referenceMimeType: job.referenceMedia.mimeType as "image/jpeg" | "image/png" | "image/webp",
        });
      } else {
        generated = await runtime.provider.generate(request);
      }
    } catch (error) {
      await this.recordFailure(job.id, this.classify(error, "provider"));
      return;
    }

    if (!generated.length || generated.length > job.candidateCount) {
      await this.recordFailure(job.id, { code: "invalid_provider_output", message: "The image provider returned an invalid candidate count.", retryable: false });
      return;
    }

    const stored: StoredCandidate[] = [];
    try {
      for (const candidate of generated) {
        let normalized;
        try {
          normalized = await validateAndNormalizeProductImage(candidate.bytes);
        } catch (error) {
          await this.compensate(runtime.storage, stored.map((item) => item.storageKey));
          await this.recordFailure(job.id, this.classify(error, "validation"));
          return;
        }
        const storageKey = createProductMediaStorageKey(job.productId, normalized.sha256, "private");
        try {
          await runtime.storage.put({ key: storageKey, bytes: normalized.bytes, contentType: normalized.mimeType, visibility: "private" });
        } catch (error) {
          await this.compensate(runtime.storage, stored.map((item) => item.storageKey));
          await this.recordFailure(job.id, this.classify(error, "storage"));
          return;
        }
        stored.push({
          storageKey,
          mimeType: normalized.mimeType,
          width: normalized.width,
          height: normalized.height,
          byteSize: normalized.byteSize,
          sha256: normalized.sha256,
          ...(candidate.providerRequestId ? { providerRequestId: candidate.providerRequestId } : {}),
        });
      }

      try {
        await this.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "ImageGenerationJob" WHERE id=${job.id} FOR UPDATE`;
          const current = await tx.imageGenerationJob.findUnique({ where: { id: job.id }, include: { candidates: { select: { id: true } } } });
          if (!current) throw new Error("Image generation job disappeared before candidate persistence.");
          if (current.status === "succeeded") return;
          if (current.status !== "generating") throw new Error("Image generation job changed state before candidate persistence.");
          if (current.candidates.length) throw new Error("Image generation job already has persisted candidates.");

          const candidateIds: string[] = [];
          for (const candidate of stored) {
            const row = await tx.productMedia.create({
              data: {
                productId: job.productId,
                source: job.mode === "branded_packshot_edit" ? "ai_edited" : "ai_generated",
                status: "ready_for_review",
                storageKey: candidate.storageKey,
                publicUrl: null,
                mimeType: candidate.mimeType,
                width: candidate.width,
                height: candidate.height,
                byteSize: candidate.byteSize,
                sha256: candidate.sha256,
                altText: job.product.name,
                generationJobId: job.id,
                createdBy: job.requestedBy,
              },
            });
            candidateIds.push(row.id);
          }
          await tx.imageGenerationJob.update({
            where: { id: job.id },
            data: {
              status: "succeeded",
              providerRequestId: stored.find((item) => item.providerRequestId)?.providerRequestId ?? null,
              errorCode: null,
              errorMessage: null,
              completedAt: new Date(),
            },
          });
          await tx.auditEvent.create({
            data: {
              actorId: job.requestedBy,
              action: "media.generation.completed",
              entityId: job.id,
              requestId: `media-worker:${job.id}:${job.attemptCount}`,
              details: {
                productId: job.productId,
                provider: job.provider,
                model: job.model,
                attemptCount: job.attemptCount,
                candidateIds,
                totalBytes: stored.reduce((sum, item) => sum + item.byteSize, 0),
              },
            },
          });
        });
      } catch (error) {
        await this.compensate(runtime.storage, stored.map((item) => item.storageKey));
        await this.recordFailure(job.id, this.classify(error, "database"));
        return;
      }
    } finally {
      // All failure paths compensate explicitly before returning. Successful paths retain objects.
    }

    console.log(JSON.stringify({
      event: "media.generation.completed",
      jobId: job.id,
      productId: job.productId,
      attemptCount: job.attemptCount,
      candidates: stored.length,
      bytes: stored.reduce((sum, item) => sum + item.byteSize, 0),
      latencyMs: Date.now() - started,
    }));
  }
}
