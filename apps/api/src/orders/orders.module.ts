import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { DeliveryConfigModule } from "../delivery-config/delivery-config.module";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { PaymentsModule } from "../payments/payments.module";
import { RefundsModule } from "../refunds/refunds.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { VerificationCodeService } from "./verification-code.service";
import { CheckoutQuoteService } from "./checkout-quote.service";
import { CheckoutCommandService } from "./checkout-command.service";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { AccountOrdersController } from "./account-orders.controller";
import { AccountController } from "./account.controller";
import { AccountProfileService } from "./account-profile.service";
import { OrderProjectionService } from "./order-projection.service";
import { OrderQueryService } from "./order-query.service";
import { TrackingThrottleService } from "./tracking-throttle.service";
import { OrderCancellationService } from "./order-cancellation.service";
import { OrderFinancialActionService } from "./order-financial-action.service";
import { AdminOrderActionsController } from "./admin-order-actions.controller";

@Module({
  imports: [InventoryModule, DeliveryConfigModule, CommerceIdentityModule, PaymentsModule, RefundsModule, LogisticsModule],
  controllers: [CheckoutController, OrdersController, AccountController, AccountOrdersController, AdminOrderActionsController],
  providers: [VerificationCodeService, CheckoutQuoteService, CheckoutCommandService, OrderProjectionService, OrderQueryService, TrackingThrottleService, OrderCancellationService, OrderFinancialActionService, AccountProfileService],
  exports: [VerificationCodeService, CheckoutQuoteService, CheckoutCommandService, OrderProjectionService, OrderQueryService, TrackingThrottleService, OrderCancellationService, OrderFinancialActionService],
})
export class OrdersModule {}
