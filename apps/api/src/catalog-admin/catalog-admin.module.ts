import { Module } from "@nestjs/common";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CatalogAdminService } from "./catalog-admin.service";
import { CatalogAdminReadController } from "./catalog-admin-read.controller";

@Module({ controllers: [CatalogAdminController, CatalogAdminReadController], providers: [CatalogAdminService] })
export class CatalogAdminModule {}
