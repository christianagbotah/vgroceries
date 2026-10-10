import { Module } from "@nestjs/common";
import { PaymentPolicyService } from "./payment-policy.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Module({
  providers: [PaymentProviderRegistry, PaymentPolicyService],
  exports: [PaymentProviderRegistry, PaymentPolicyService],
})
export class PaymentsModule {}
