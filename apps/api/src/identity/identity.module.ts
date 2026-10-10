import { Global, Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { AccessGuard } from "./access.guard";
@Global()
@Module({
  controllers: [IdentityController],
  providers: [IdentityService, AccessGuard],
  exports: [IdentityService, AccessGuard],
})
export class IdentityModule {}
