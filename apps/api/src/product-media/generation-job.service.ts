import { Inject, Injectable } from "@nestjs/common";
import type { ImageGenerationJob } from "@prisma/client";
import type { CreateGenerationRequest, ImageGenerationJobView } from "@variety/contracts";
import { createHash } from "node:crypto";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { buildProductImagePrompt } from "./product-image-prompt";

const OPERATION = "product_media_generation";

type JobWithCandidates = ImageGenerationJob & { candidates: { id: string }[] };

function view(job: JobWithCandidates): ImageGenerationJobView {
  return {
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
    candidateMediaIds: job.candidates.map((candidate) => candidate.id),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    ...(job.startedAt ? { startedAt: job.startedAt.toISOString() } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function requestHash(productId: string, input: CreateGenerationRequest): string {
  return createHash("sha256").update(JSON.stringify({
    productId,
    mode: input.mode,
    stylePreset: input.stylePreset,
    backgroundIntent: input.backgroundIntent,
    candidateCount: input.candidateCount,
    referenceMediaId: input.referenceMediaId ?? null,
    operatorNote: input.operatorNote?.trim() ?? null,
  })).digest("hex");
}

@Injectable()
export class GenerationJobService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private generationConfig() {
    if (!this.config.imageGeneration)
      throw new ApiProblem(503, "AI_IMAGE_PROVIDER_UNAVAILABLE", "AI product image generation is not configured.");
    return this.config.imageGeneration;
  }

  async queueGeneration(input: {
    productId: string;
    actorId: string;
    requestId: string;
    idempotencyKey: string;
    request: CreateGenerationRequest;
  }): Promise<ImageGenerationJobView> {
    const generation = this.generationConfig();
    if (input.request.candidateCount > generation.maxCandidates)
      throw new ApiProblem(400, "VALIDATION_FAILED", `At most ${generation.maxCandidates} image candidates may be requested.`);

    const hash = requestHash(input.productId, input.request);
    const lockKey = JSON.stringify([input.actorId, OPERATION, input.idempotencyKey]);

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
      const replay = await tx.idempotency.findUnique({
        where: {
          actorId_operation_key: {
            actorId: input.actorId,
            operation: OPERATION,
            key: input.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different product media generation input.");
        const jobId = (replay.outcome as { jobId?: unknown }).jobId;
        if (typeof jobId !== "string")
          throw new ApiProblem(500, "INTERNAL", "Stored generation replay outcome is invalid.");
        const job = await tx.imageGenerationJob.findUnique({
          where: { id: jobId },
          include: { candidates: { select: { id: true }, orderBy: { createdAt: "asc" } } },
        });
        if (!job) throw new ApiProblem(500, "INTERNAL", "Stored generation replay target is missing.");
        return view(job);
      }

      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${input.productId} FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        include: { category: { select: { name: true } } },
      });
      if (!product) throw new ApiProblem(404, "PRODUCT_NOT_FOUND", "Product not found.");

      const resolvedBrandMode =
        product.brandMode === "branded" || input.request.mode === "branded_packshot_edit"
          ? "branded"
          : "unbranded";

      if (product.brandMode === "branded" && input.request.mode !== "branded_packshot_edit")
        throw new ApiProblem(400, "REFERENCE_IMAGE_REQUIRED", "Branded products require genuine reference-image editing.");
      if (input.request.mode === "branded_packshot_edit" && !input.request.referenceMediaId)
        throw new ApiProblem(400, "REFERENCE_IMAGE_REQUIRED", "A genuine reference image is required for branded product editing.");
      if (input.request.mode === "unbranded_generation" && input.request.referenceMediaId)
        throw new ApiProblem(400, "VALIDATION_FAILED", "Reference media is accepted only for branded packshot editing.");

      let referenceImageProvided = false;
      if (input.request.referenceMediaId) {
        const reference = await tx.productMedia.findFirst({
          where: { id: input.request.referenceMediaId, productId: input.productId },
        });
        if (!reference) throw new ApiProblem(404, "MEDIA_NOT_FOUND", "Reference product media not found.");
        if (
          reference.archivedAt ||
          !["ready_for_review", "approved"].includes(reference.status) ||
          !["upload", "legacy_import"].includes(reference.source)
        ) throw new ApiProblem(400, "REFERENCE_IMAGE_REQUIRED", "Reference media must be a genuine active uploaded product image.");
        referenceImageProvided = true;
      }

      const prompt = buildProductImagePrompt({
        product: {
          name: product.name,
          categoryName: product.category.name,
          shortDescription: product.shortDescription,
          description: product.description,
          tags: product.tags,
        },
        mode: input.request.mode,
        resolvedBrandMode,
        stylePreset: input.request.stylePreset,
        backgroundIntent: input.request.backgroundIntent,
        operatorNote: input.request.operatorNote,
        referenceImageProvided,
      });

      const job = await tx.imageGenerationJob.create({
        data: {
          productId: input.productId,
          requestedBy: input.actorId,
          mode: input.request.mode,
          stylePreset: input.request.stylePreset,
          status: "queued",
          provider: generation.providerId,
          model: generation.model,
          prompt,
          requestSnapshot: {
            mode: input.request.mode,
            stylePreset: input.request.stylePreset,
            backgroundIntent: input.request.backgroundIntent,
            candidateCount: input.request.candidateCount,
            resolvedBrandMode,
            ...(input.request.referenceMediaId ? { referenceMediaId: input.request.referenceMediaId } : {}),
            ...(input.request.operatorNote ? { operatorNote: input.request.operatorNote } : {}),
          },
          referenceMediaId: input.request.referenceMediaId,
          candidateCount: input.request.candidateCount,
          attemptCount: 0,
        },
        include: { candidates: { select: { id: true } } },
      });

      await tx.auditEvent.create({
        data: {
          actorId: input.actorId,
          action: "media.generation.requested",
          entityId: job.id,
          requestId: input.requestId,
          details: {
            productId: input.productId,
            mode: input.request.mode,
            stylePreset: input.request.stylePreset,
            backgroundIntent: input.request.backgroundIntent,
            candidateCount: input.request.candidateCount,
            provider: generation.providerId,
            model: generation.model,
            ...(input.request.referenceMediaId ? { referenceMediaId: input.request.referenceMediaId } : {}),
          },
        },
      });
      await tx.idempotency.create({
        data: {
          actorId: input.actorId,
          operation: OPERATION,
          key: input.idempotencyKey,
          requestHash: hash,
          outcome: { jobId: job.id },
        },
      });
      return view(job);
    }, { timeout: 15_000 });
  }

  async getGeneration(jobId: string): Promise<ImageGenerationJobView> {
    const job = await this.db.imageGenerationJob.findUnique({
      where: { id: jobId },
      include: { candidates: { select: { id: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!job) throw new ApiProblem(404, "GENERATION_NOT_FOUND", "Image generation job not found.");
    return view(job);
  }
}
