import { Module } from "@nestjs/common";
import { AdminCmsController, PublicCmsController } from "./cms.controller";
import { CmsService } from "./cms.service";

@Module({ controllers: [PublicCmsController, AdminCmsController], providers: [CmsService], exports: [CmsService] })
export class CmsModule {}
