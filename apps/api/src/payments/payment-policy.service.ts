import { Inject, Injectable } from "@nestjs/common";
import type {
  ElectronicPaymentMethod,
  PaymentProviderAction,
} from "@variety/contracts";
import type { Prisma } from "@prisma/client";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";
import type { PaymentProviderAdapter } from "./payment-provider";
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

  assertElectronicMethodAvailable(
    method: ElectronicPaymentMethod,
  ): PaymentProviderAdapter {
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
    if (action.kind !== "redirect") return action;
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
