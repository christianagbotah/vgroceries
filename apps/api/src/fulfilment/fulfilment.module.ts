import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { PaymentsModule } from "../payments/payments.module";
import { FulfilmentCommandService } from "./fulfilment-command.service";
import { FulfilmentPolicyService } from "./fulfilment-policy.service";

@Module({
  imports: [InventoryModule, PaymentsModule],
  providers: [FulfilmentPolicyService, FulfilmentCommandService],
  exports: [FulfilmentPolicyService, FulfilmentCommandService],
})
export class FulfilmentModule {}
