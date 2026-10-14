import { Module } from "@nestjs/common";
import { GenerationJobService } from "./generation-job.service";
import { ProductMediaController } from "./product-media.controller";
import { productMediaStorageProvider } from "./product-media.provider";
import { ProductMediaService } from "./product-media.service";

@Module({
  controllers: [ProductMediaController],
  providers: [productMediaStorageProvider, ProductMediaService, GenerationJobService],
  exports: [productMediaStorageProvider, ProductMediaService, GenerationJobService],
})
export class ProductMediaModule {}
