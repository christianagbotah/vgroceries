import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";
import type { PaymentProviderAdapter } from "./payment-provider";

export const PAYMENT_PROVIDER_ADAPTERS = Symbol("PAYMENT_PROVIDER_ADAPTERS");

@Injectable()
export class PaymentProviderRegistry {
  private readonly adapters = new Map<string, PaymentProviderAdapter>();

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(PAYMENT_PROVIDER_ADAPTERS) adapters: PaymentProviderAdapter[],
  ) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: PaymentProviderAdapter) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(adapter.id))
      throw new Error("Payment provider adapter IDs must be stable lowercase identifiers");
    if (this.adapters.has(adapter.id))
      throw new Error(`Payment provider adapter '${adapter.id}' is already registered`);
    this.adapters.set(adapter.id, adapter);
  }

  configured(): PaymentProviderAdapter | null {
    if (!this.config.payments) return null;
    return this.adapters.get(this.config.payments.providerId) ?? null;
  }

  requireConfigured(): PaymentProviderAdapter {
    const payment = this.config.payments;
    if (!payment)
      throw new ApiProblem(503, "UNAVAILABLE", "Electronic payments are not configured.");
    const adapter = this.adapters.get(payment.providerId);
    if (!adapter)
      throw new ApiProblem(503, "UNAVAILABLE", "The configured payment provider is unavailable.");
    const supported = new Set(adapter.capabilities().methods);
    const unsupported = payment.enabledMethods.filter((method) => !supported.has(method));
    if (unsupported.length)
      throw new ApiProblem(503, "UNAVAILABLE", "The configured payment provider does not support all enabled methods.");
    return adapter;
  }

  assertReadyIfConfigured(): void {
    if (!this.config.payments) return;
    this.requireConfigured();
  }
}
