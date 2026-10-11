import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { RefundActionService } from "./refund-action.service";
import { RefundObligationService } from "./refund-obligation.service";
import { RefundOutcomeService } from "./refund-outcome.service";
import { RefundsController } from "./refunds.controller";

@Module({
  imports: [PaymentsModule],
  controllers: [RefundsController],
  providers: [RefundObligationService, RefundOutcomeService, RefundActionService],
  exports: [RefundObligationService, RefundOutcomeService, RefundActionService],
})
export class RefundsModule {}
