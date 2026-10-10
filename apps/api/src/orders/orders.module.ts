import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.controller";
import { DeliveryConfigModule } from "../delivery-config/delivery-config.module";
import { GuestCheckoutService } from "./guest-checkout.service";
import { CheckoutPrincipalService } from "./checkout-principal.service";
import { VerificationCodeService } from "./verification-code.service";
import { CheckoutQuoteService } from "./checkout-quote.service";
import { CheckoutCommandService } from "./checkout-command.service";
import { CheckoutController } from "./checkout.controller";

@Module({
  imports: [InventoryModule, DeliveryConfigModule],
  controllers: [CheckoutController],
  providers: [GuestCheckoutService, CheckoutPrincipalService, VerificationCodeService, CheckoutQuoteService, CheckoutCommandService],
  exports: [GuestCheckoutService, CheckoutPrincipalService, VerificationCodeService, CheckoutQuoteService, CheckoutCommandService],
})
export class OrdersModule {}
