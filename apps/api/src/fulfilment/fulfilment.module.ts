import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { PaymentsModule } from "../payments/payments.module";
import { FulfilmentCommandService } from "./fulfilment-command.service";
import { FulfilmentController } from "./fulfilment.controller";
import { FulfilmentPolicyService } from "./fulfilment-policy.service";
import { FulfilmentQueryService } from "./fulfilment-query.service";

@Module({
  imports: [InventoryModule, PaymentsModule],
  controllers: [FulfilmentController],
  providers: [FulfilmentPolicyService, FulfilmentCommandService, FulfilmentQueryService],
  exports: [FulfilmentPolicyService, FulfilmentCommandService, FulfilmentQueryService],
})
export class FulfilmentModule {}
