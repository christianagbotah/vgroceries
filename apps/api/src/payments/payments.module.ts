import { Module } from "@nestjs/common";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { InventoryModule } from "../inventory/inventory.controller";
import { PaymentAttemptsController } from "./payment-attempts.controller";
import { PaymentEventsController } from "./payment-events.controller";
import { PaymentEventService } from "./payment-event.service";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentOutcomeService } from "./payment-outcome.service";
import { PaymentPolicyService } from "./payment-policy.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Module({
  imports: [CommerceIdentityModule, InventoryModule],
  controllers: [PaymentAttemptsController, PaymentEventsController],
  providers: [
    PaymentProviderRegistry,
    PaymentPolicyService,
    PaymentInitiationService,
    PaymentOutcomeService,
    PaymentEventService,
  ],
  exports: [
    PaymentProviderRegistry,
    PaymentPolicyService,
    PaymentInitiationService,
    PaymentOutcomeService,
    PaymentEventService,
  ],
})
export class PaymentsModule {}
