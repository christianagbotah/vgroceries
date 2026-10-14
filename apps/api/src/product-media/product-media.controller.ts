import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { MAX_PRODUCT_MEDIA_BYTES } from "./image-validation";
import { ProductMediaService } from "./product-media.service";

@Controller("admin/catalog")
@UseGuards(AccessGuard)
export class ProductMediaController {
  constructor(private readonly media: ProductMediaService) {}

  @Get("products/:productId/media")
  @Permission("catalog.media.read")
  async view(@Param("productId") productId: string) {
    return { ok: true, data: await this.media.viewProductMedia(productId) };
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

  @Get("media/:mediaId/content")
  @Permission("catalog.media.read")
  async content(@Param("mediaId") mediaId: string, @Res() res: Response) {
    const media = await this.media.readContent(mediaId);
    res.setHeader("content-type", media.mimeType);
    res.setHeader("cache-control", "private, no-store");
    res.status(200).end(media.bytes);
  }
}
