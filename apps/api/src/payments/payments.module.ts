import { Module } from "@nestjs/common";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { AllocationService } from "../inventory/allocation.service";
import { PaymentAttemptsController } from "./payment-attempts.controller";
import { PaymentEventsController } from "./payment-events.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentEventService } from "./payment-event.service";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentQueryService } from "./payment-query.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentOutcomeService } from "./payment-outcome.service";
import { PaymentPolicyService } from "./payment-policy.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Module({
  imports: [CommerceIdentityModule],
  controllers: [PaymentAttemptsController, PaymentEventsController, PaymentsController],
  providers: [
    // Reuse Inventory's allocation authority class directly. Importing the
    // controller-bearing InventoryModule would blur the module boundary and
    // make generated route ordering depend on a second controller graph.
    AllocationService,
    PaymentProviderRegistry,
    PaymentPolicyService,
    PaymentInitiationService,
    PaymentOutcomeService,
    PaymentEventService,
    PaymentQueryService,
    PaymentReconciliationService,
  ],
  exports: [
    PaymentProviderRegistry,
    PaymentPolicyService,
    PaymentInitiationService,
    PaymentOutcomeService,
    PaymentEventService,
    PaymentQueryService,
    PaymentReconciliationService,
  ],
})
export class PaymentsModule {}
