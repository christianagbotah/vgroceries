import { Module } from "@nestjs/common";
import { CatalogAdminController, CatalogVariantPriceController } from "./catalog-admin.controller";
import { CatalogAdminCategoryController } from "./catalog-admin-category.controller";
import { CatalogAdminCategoryService } from "./catalog-admin-category.service";
import { CatalogAdminService } from "./catalog-admin.service";
import { CatalogAdminReadController } from "./catalog-admin-read.controller";

@Module({
  controllers: [CatalogAdminController, CatalogVariantPriceController, CatalogAdminCategoryController, CatalogAdminReadController],
  providers: [CatalogAdminService, CatalogAdminCategoryService],
})
export class CatalogAdminModule {}
