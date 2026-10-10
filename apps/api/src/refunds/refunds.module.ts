import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { RefundObligationService } from "./refund-obligation.service";
import { RefundOutcomeService } from "./refund-outcome.service";

@Module({
  imports: [PaymentsModule],
  providers: [RefundObligationService, RefundOutcomeService],
  exports: [RefundObligationService, RefundOutcomeService],
})
export class RefundsModule {}
