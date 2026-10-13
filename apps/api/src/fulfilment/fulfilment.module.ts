import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { FulfilmentCommandService } from "./fulfilment-command.service";
import { FulfilmentPolicyService } from "./fulfilment-policy.service";

@Module({
  imports: [InventoryModule],
  providers: [FulfilmentPolicyService, FulfilmentCommandService],
  exports: [FulfilmentPolicyService, FulfilmentCommandService],
})
export class FulfilmentModule {}
