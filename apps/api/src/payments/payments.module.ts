import { Module } from "@nestjs/common";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { PaymentAttemptsController } from "./payment-attempts.controller";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentPolicyService } from "./payment-policy.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Module({
  imports: [CommerceIdentityModule],
  controllers: [PaymentAttemptsController],
  providers: [PaymentProviderRegistry, PaymentPolicyService, PaymentInitiationService],
  exports: [PaymentProviderRegistry, PaymentPolicyService, PaymentInitiationService],
})
export class PaymentsModule {}
