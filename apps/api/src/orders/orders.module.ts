import { Module } from "@nestjs/common";
import { GuestCheckoutService } from "./guest-checkout.service";
import { CheckoutPrincipalService } from "./checkout-principal.service";
import { VerificationCodeService } from "./verification-code.service";

@Module({
  providers: [GuestCheckoutService, CheckoutPrincipalService, VerificationCodeService],
  exports: [GuestCheckoutService, CheckoutPrincipalService, VerificationCodeService],
})
export class OrdersModule {}
