import { Module } from "@nestjs/common";
import { ProductMediaController } from "./product-media.controller";
import { productMediaStorageProvider } from "./product-media.provider";
import { ProductMediaService } from "./product-media.service";

@Module({
  controllers: [ProductMediaController],
  providers: [productMediaStorageProvider, ProductMediaService],
  exports: [productMediaStorageProvider, ProductMediaService],
})
export class ProductMediaModule {}
