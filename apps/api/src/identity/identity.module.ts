import { Global, Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { AccessGuard } from "./access.guard";
import { PasswordRecoveryService } from "./password-recovery.service";
@Global()
@Module({
  controllers: [IdentityController],
  providers: [IdentityService, AccessGuard, PasswordRecoveryService],
  exports: [IdentityService, AccessGuard],
})
export class IdentityModule {}
