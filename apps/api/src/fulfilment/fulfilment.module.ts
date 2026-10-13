import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { PaymentsModule } from "../payments/payments.module";
import { FulfilmentCommandService } from "./fulfilment-command.service";
import { FulfilmentPolicyService } from "./fulfilment-policy.service";
import { FulfilmentQueryService } from "./fulfilment-query.service";

@Module({
  imports: [InventoryModule, PaymentsModule],
  providers: [FulfilmentPolicyService, FulfilmentCommandService, FulfilmentQueryService],
  exports: [FulfilmentPolicyService, FulfilmentCommandService, FulfilmentQueryService],
})
export class FulfilmentModule {}
