import { Inject, Injectable } from "@nestjs/common";
import type {
  ElectronicPaymentMethod,
  PaymentProviderAction,
} from "@variety/contracts";
import type { Prisma } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";
import type { PaymentProviderAdapter } from "./payment-provider";
import type { CheckoutPrincipal } from "../commerce-identity/checkout-principal.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { RefundProviderRegistry } from "./refund-provider.registry";
import { PaymentCaptureService } from "./payment-capture.service";

@Injectable()
export class PaymentPolicyService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly registry: PaymentProviderRegistry,
    private readonly refundRegistry: RefundProviderRegistry,
    private readonly captures: PaymentCaptureService,
  ) {}

  isStagingMomoPilot(): boolean { return Boolean(this.config.stagingMomoPilot); }

  assertStagingPilotCustomer(principal: CheckoutPrincipal): void {
    const pilot = this.config.stagingMomoPilot;
    if (!pilot) return;
    if (principal.kind !== "customer" || principal.userId !== pilot.customerId ||
        Date.now() >= pilot.expiresAt.valueOf())
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic checkout is restricted to a temporary authenticated staging test.");
  }

  assertStagingPilotAmount(amountMinor: number): void {
    const pilot = this.config.stagingMomoPilot;
    if (!pilot) return;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > pilot.maxMinor)
      throw new ApiProblem(422, "RULE_VIOLATION", "This amount is outside the temporary staging payment-test limit.");
  }

  assertStagingPilotPayer(phone: string, channel?: string): void {
    const pilot = this.config.stagingMomoPilot;
    if (!pilot) return;
    if (phone !== pilot.phone || channel !== pilot.channel)
      throw new ApiProblem(422, "RULE_VIOLATION", "Only the pre-authorized test number and mobile network can receive this staging prompt.");
  }

  resolveElectronicMethod(): { method: ElectronicPaymentMethod; adapter: PaymentProviderAdapter } {
    const payment = this.config.payments;
    const method = payment?.enabledMethods[0];
    if (!method)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payments are not configured.");
    return { method, adapter: this.assertElectronicMethodAvailable(method) };
  }

  assertElectronicMethodAvailable(
    method: ElectronicPaymentMethod,
  ): PaymentProviderAdapter {
    // Hubtel Direct Receive sends an unsolicited wallet prompt unless a
    // verified, immutable payer identity exists. Until an OTP-backed general
    // flow is built, this official RMP adapter is owner-pilot-only.
    if (this.config.hubtelPayment?.directReceive && !this.config.stagingMomoPilot)
      throw new ApiProblem(503, "UNAVAILABLE",
        "Direct Mobile Money collection requires an authenticated restricted pilot.");
    const payment = this.config.payments;
    if (!payment)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payments are not configured.");
    if (!payment.enabledMethods.includes(method))
      throw new ApiProblem(503, "UNAVAILABLE", "This electronic payment method is unavailable.");
    const adapter = this.registry.requireConfigured();
    if (!adapter.capabilities().methods.includes(method))
      throw new ApiProblem(503, "UNAVAILABLE", "This electronic payment method is unavailable.");
    this.refundRegistry.require(adapter.id, method);
    return adapter;
  }

  assertReadyIfConfigured(): void {
    const payment = this.config.payments;
    if (!payment) return;
    this.registry.requireConfigured();
    for (const method of payment.enabledMethods) this.assertElectronicMethodAvailable(method);
  }

  async assertCancellationSafe(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    // Orders already holds the Order row. Payments owns the stable attempt lock/classification boundary.
    const state = await this.captures.lockForOrder(tx, orderId);
    if (state.successfulCaptures.length > 0)
      throw new ApiProblem(
        422,
        "RULE_VIOLATION",
        "This order requires the refund workflow before cancellation.",
      );
    if (state.liveAttempts.length > 0)
      throw new ApiProblem(
        422,
        "RULE_VIOLATION",
        "Payment reconciliation is required before this order can be cancelled.",
      );
  }

  validateProviderAction(action: PaymentProviderAction): PaymentProviderAction {
    if (action.kind !== "redirect" && action.kind !== "form_post") return action;
    const payment = this.config.payments;
    if (!payment)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payments are not configured.");
    let url: URL;
    try {
      url = new URL(action.url);
    } catch {
      throw new ApiProblem(503, "UNAVAILABLE", "Payment provider returned an invalid hosted checkout URL.");
    }
    if (url.protocol !== "https:")
      throw new ApiProblem(503, "UNAVAILABLE", "Hosted payment redirects must use HTTPS.");
    if (!payment.hostedDomains.includes(url.hostname.toLowerCase()))
      throw new ApiProblem(503, "UNAVAILABLE", "Hosted payment redirect is outside the configured allowlist.");
    return action;
  }
}
