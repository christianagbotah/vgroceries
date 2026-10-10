import { Module } from "@nestjs/common";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { AllocationService } from "../inventory/allocation.service";
import { PaymentAttemptsController } from "./payment-attempts.controller";
import { PaymentEventsController } from "./payment-events.controller";
import { PaymentEventService } from "./payment-event.service";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentOutcomeService } from "./payment-outcome.service";
import { PaymentPolicyService } from "./payment-policy.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Module({
  imports: [CommerceIdentityModule],
  controllers: [PaymentAttemptsController, PaymentEventsController],
  providers: [
    // Reuse Inventory's allocation authority class directly. Importing the
    // controller-bearing InventoryModule here would reorder Swagger's staged
    // module traversal before the intentional Task 10 API cutover.
    AllocationService,
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
