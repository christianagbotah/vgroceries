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

@Injectable()
export class PaymentPolicyService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly registry: PaymentProviderRegistry,
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
    return adapter;
  }

  async assertCancellationSafe(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    // Orders already holds the Order row. Keep the global lock order by
    // locking every attempt for that order in stable id order before reading
    // payment authority.
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${orderId} ORDER BY id FOR UPDATE`;
    const attempts = await tx.paymentAttempt.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
      select: { status: true },
    });
    if (attempts.some((attempt) => attempt.status === "succeeded"))
      throw new ApiProblem(
        422,
        "RULE_VIOLATION",
        "This order requires the refund workflow before cancellation.",
      );
    if (attempts.some((attempt) => attempt.status === "initiated" || attempt.status === "pending"))
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
