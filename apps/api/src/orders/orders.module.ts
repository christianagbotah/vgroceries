import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { DeliveryConfigModule } from "../delivery-config/delivery-config.module";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { VerificationCodeService } from "./verification-code.service";
import { CheckoutQuoteService } from "./checkout-quote.service";
import { CheckoutCommandService } from "./checkout-command.service";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { AccountOrdersController } from "./account-orders.controller";
import { OrderProjectionService } from "./order-projection.service";
import { OrderQueryService } from "./order-query.service";
import { TrackingThrottleService } from "./tracking-throttle.service";
import { OrderCancellationService } from "./order-cancellation.service";

@Module({
  imports: [InventoryModule, DeliveryConfigModule, CommerceIdentityModule],
  controllers: [CheckoutController, OrdersController, AccountOrdersController],
  providers: [VerificationCodeService, CheckoutQuoteService, CheckoutCommandService, OrderProjectionService, OrderQueryService, TrackingThrottleService, OrderCancellationService],
  exports: [VerificationCodeService, CheckoutQuoteService, CheckoutCommandService, OrderProjectionService, OrderQueryService, TrackingThrottleService, OrderCancellationService],
})
export class OrdersModule {}
