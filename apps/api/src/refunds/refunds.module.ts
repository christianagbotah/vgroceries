import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { RefundActionService } from "./refund-action.service";
import { RefundObligationService } from "./refund-obligation.service";
import { RefundOutcomeService } from "./refund-outcome.service";
import { RefundQueryService } from "./refund-query.service";
import { RefundsController } from "./refunds.controller";
import { HubtelRefundCallbackController } from "./hubtel-refund-callback.controller";
import { HubtelRefundCallbackService } from "./hubtel-refund-callback.service";

@Module({
  imports: [PaymentsModule],
  controllers: [RefundsController, HubtelRefundCallbackController],
  providers: [RefundObligationService, RefundOutcomeService, RefundActionService, RefundQueryService, HubtelRefundCallbackService],
  exports: [RefundObligationService, RefundOutcomeService, RefundActionService, RefundQueryService],
})
export class RefundsModule {}
