import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { GuestCheckoutService } from "./guest-checkout.service";
import { CheckoutPrincipalService } from "./checkout-principal.service";

@Module({
  imports: [IdentityModule],
  providers: [GuestCheckoutService, CheckoutPrincipalService],
  exports: [GuestCheckoutService, CheckoutPrincipalService],
})
export class CommerceIdentityModule {}
