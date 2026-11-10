import { Module } from "@nestjs/common";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CatalogAdminCategoryController } from "./catalog-admin-category.controller";
import { CatalogAdminCategoryService } from "./catalog-admin-category.service";
import { CatalogAdminService } from "./catalog-admin.service";
import { CatalogAdminReadController } from "./catalog-admin-read.controller";

@Module({
  controllers: [CatalogAdminController, CatalogAdminCategoryController, CatalogAdminReadController],
  providers: [CatalogAdminService, CatalogAdminCategoryService],
})
export class CatalogAdminModule {}
