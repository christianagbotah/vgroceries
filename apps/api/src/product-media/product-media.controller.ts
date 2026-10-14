import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createGenerationRequestSchema,
  replayKeySchema,
  reorderGalleryRequestSchema,
  setFeaturedMediaRequestSchema,
  setProductBrandModeRequestSchema,
} from "@variety/contracts";
import type { Response } from "express";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { GenerationJobService } from "./generation-job.service";
import { MAX_PRODUCT_MEDIA_BYTES } from "./image-validation";
import { ProductMediaService } from "./product-media.service";

@Controller("admin/catalog")
@UseGuards(AccessGuard)
export class ProductMediaController {
  constructor(
    private readonly media: ProductMediaService,
    private readonly generations: GenerationJobService,
  ) {}

  @Get("products/:productId/media")
  @Permission("catalog.media.read")
  async view(@Param("productId") productId: string) {
    return { ok: true, data: await this.media.viewProductMedia(productId) };
  }

  @Post("products/:productId/media/generations")
  @Permission("catalog.media.generate")
  async generate(
    @Req() req: AuthRequest,
    @Param("productId") productId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = createGenerationRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid product image generation request.");
    const key = replayKeySchema.safeParse(idempotencyKey);
    if (!key.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A valid Idempotency-Key is required.");
    return {
      ok: true,
      data: await this.generations.queueGeneration({
        productId,
        actorId: req.actor.id,
        requestId: req.requestId,
        idempotencyKey: key.data,
        request: parsed.data,
      }),
    };
  }

  @Get("media/generations/:jobId")
  @Permission("catalog.media.read")
  async generation(@Param("jobId") jobId: string) {
    return { ok: true, data: await this.generations.getGeneration(jobId) };
  }

  @Post("products/:productId/media/uploads")
  @Permission("catalog.media.upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PRODUCT_MEDIA_BYTES } }))
  async upload(
    @Req() req: AuthRequest,
    @Param("productId") productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("altText") altText?: string,
  ) {
    if (!file)
      throw new ApiProblem(400, "VALIDATION_FAILED", "A product image file is required.");
    if (altText !== undefined && (typeof altText !== "string" || altText.length > 1000))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Image alt text is invalid.");
    return {
      ok: true,
      data: await this.media.ingestUpload({
        productId,
        actorId: req.actor.id,
        requestId: req.requestId,
        originalFilename: file.originalname,
        altText: altText ?? "",
        bytes: file.buffer,
      }),
    };
  }

  @Post("media/:mediaId/approve")
  @HttpCode(200)
  @Permission("catalog.media.approve")
  async approve(@Req() req: AuthRequest, @Param("mediaId") mediaId: string) {
    return { ok: true, data: await this.media.approve(mediaId, req.actor.id, req.requestId) };
  }

  @Post("media/:mediaId/reject")
  @HttpCode(200)
  @Permission("catalog.media.approve")
  async reject(@Req() req: AuthRequest, @Param("mediaId") mediaId: string) {
    return { ok: true, data: await this.media.reject(mediaId, req.actor.id, req.requestId) };
  }

  @Post("media/:mediaId/archive")
  @HttpCode(200)
  @Permission("catalog.media.publish")
  async archive(
    @Req() req: AuthRequest,
    @Param("mediaId") mediaId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const input = body ?? {};
    if (Object.keys(input).some((key) => key !== "replacementFeaturedMediaId"))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Archive request contains unsupported fields.");
    const replacement = Object.prototype.hasOwnProperty.call(input, "replacementFeaturedMediaId")
      ? input.replacementFeaturedMediaId
      : undefined;
    if (replacement !== undefined && replacement !== null && (typeof replacement !== "string" || !replacement.trim()))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Replacement featured media ID is invalid.");
    return {
      ok: true,
      data: await this.media.archive(
        mediaId,
        req.actor.id,
        req.requestId,
        replacement === null ? null : typeof replacement === "string" ? replacement.trim() : undefined,
      ),
    };
  }

  @Post("products/:productId/media/featured")
  @HttpCode(200)
  @Permission("catalog.media.publish")
  async featured(
    @Req() req: AuthRequest,
    @Param("productId") productId: string,
    @Body() body: unknown,
  ) {
    const parsed = setFeaturedMediaRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid featured media request.");
    return {
      ok: true,
      data: await this.media.setFeatured(productId, parsed.data.mediaId, req.actor.id, req.requestId),
    };
  }

  @Post("products/:productId/media/reorder")
  @HttpCode(200)
  @Permission("catalog.media.publish")
  async reorder(
    @Req() req: AuthRequest,
    @Param("productId") productId: string,
    @Body() body: unknown,
  ) {
    const parsed = reorderGalleryRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid gallery order request.");
    return {
      ok: true,
      data: await this.media.reorderGallery(productId, parsed.data.orderedMediaIds, req.actor.id, req.requestId),
    };
  }

  @Post("products/:productId/media/brand-mode")
  @HttpCode(200)
  @Permission("catalog.media.publish")
  async brandMode(
    @Req() req: AuthRequest,
    @Param("productId") productId: string,
    @Body() body: unknown,
  ) {
    const parsed = setProductBrandModeRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid product brand mode request.");
    return {
      ok: true,
      data: await this.media.setBrandMode(productId, parsed.data.brandMode, req.actor.id, req.requestId),
    };
  }

  @Get("media/:mediaId/content")
  @Permission("catalog.media.read")
  async content(@Param("mediaId") mediaId: string, @Res() res: Response) {
    const media = await this.media.readContent(mediaId);
    res.setHeader("content-type", media.mimeType);
    res.setHeader("cache-control", "private, no-store");
    res.status(200).end(media.bytes);
  }
}
