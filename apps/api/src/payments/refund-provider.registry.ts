import { Inject, Injectable } from "@nestjs/common";
import type { ElectronicPaymentMethod } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import type { RefundProviderAdapter } from "./refund-provider";

export const REFUND_PROVIDER_ADAPTERS = Symbol("REFUND_PROVIDER_ADAPTERS");

@Injectable()
export class RefundProviderRegistry {
  private readonly adapters = new Map<string, RefundProviderAdapter>();

  constructor(@Inject(REFUND_PROVIDER_ADAPTERS) adapters: RefundProviderAdapter[]) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: RefundProviderAdapter) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(adapter.id))
      throw new Error("Refund provider adapter IDs must be stable lowercase identifiers");
    if (this.adapters.has(adapter.id))
      throw new Error(`Refund provider adapter '${adapter.id}' is already registered`);
    this.adapters.set(adapter.id, adapter);
  }

  require(providerId: string, method: ElectronicPaymentMethod): RefundProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter)
      throw new ApiProblem(503, "UNAVAILABLE", "Refund capability for the payment provider is unavailable.");
    const capabilities = adapter.capabilities();
    if (!capabilities.methods.includes(method))
      throw new ApiProblem(503, "UNAVAILABLE", "Refund capability does not support this electronic payment method.");
    return adapter;
  }
}
