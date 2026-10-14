import type { Provider } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import { FilesystemProductMediaStorage } from "./filesystem-product-media.storage";
import type { ProductMediaStorage } from "./product-media.storage";
import { S3ProductMediaStorage } from "./s3-product-media.storage";

export const PRODUCT_MEDIA_STORAGE = Symbol("PRODUCT_MEDIA_STORAGE");

export const productMediaStorageProvider: Provider = {
  provide: PRODUCT_MEDIA_STORAGE,
  inject: [API_CONFIG],
  useFactory(config: ApiConfig): ProductMediaStorage | null {
    if (!config.productMedia) return null;
    if (config.productMedia.kind === "filesystem")
      return new FilesystemProductMediaStorage(
        config.productMedia.root,
        config.productMedia.publicBaseUrl,
      );
    return new S3ProductMediaStorage(config.productMedia);
  },
};
