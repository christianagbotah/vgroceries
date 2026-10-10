import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { RefundObligationService } from "./refund-obligation.service";

@Module({
  imports: [PaymentsModule],
  providers: [RefundObligationService],
  exports: [RefundObligationService],
})
export class RefundsModule {}
