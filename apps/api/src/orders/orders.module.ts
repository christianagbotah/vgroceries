import { Module } from "@nestjs/common";
import { GuestCheckoutService } from "./guest-checkout.service";
import { CheckoutPrincipalService } from "./checkout-principal.service";
import { VerificationCodeService } from "./verification-code.service";
import { CheckoutQuoteService } from "./checkout-quote.service";
import { CheckoutController } from "./checkout.controller";

@Module({
  controllers: [CheckoutController],
  providers: [GuestCheckoutService, CheckoutPrincipalService, VerificationCodeService, CheckoutQuoteService],
  exports: [GuestCheckoutService, CheckoutPrincipalService, VerificationCodeService, CheckoutQuoteService],
})
export class OrdersModule {}
