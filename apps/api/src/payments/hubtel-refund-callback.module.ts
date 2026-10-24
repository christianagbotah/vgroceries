import { Module } from "@nestjs/common";
import { RefundsModule } from "../refunds/refunds.module";
import { HubtelRefundCallbackController } from "./hubtel-refund-callback.controller";
import { HubtelRefundCallbackService } from "./hubtel-refund-callback.service";

@Module({
  imports: [RefundsModule],
  controllers: [HubtelRefundCallbackController],
  providers: [HubtelRefundCallbackService],
})
export class HubtelRefundCallbackModule {}
