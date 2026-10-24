import type { ApiConfig } from "../../config";
import type { PaymentProviderAdapter } from "../payment-provider";
import type { RefundProviderAdapter } from "../refund-provider";
import { PaystackPaymentAdapter, PaystackRefundAdapter } from "./paystack";

type FetchLike = typeof fetch;

export function createConfiguredProviderAdapters(
  config: ApiConfig,
  fetcher: FetchLike = fetch,
): { paymentAdapters: PaymentProviderAdapter[]; refundAdapters: RefundProviderAdapter[] } {
  const provider = config.payments?.provider;
  if (!provider) return { paymentAdapters: [], refundAdapters: [] };
  if (provider.kind === "paystack") {
    return {
      paymentAdapters: [new PaystackPaymentAdapter(provider, fetcher)],
      refundAdapters: [new PaystackRefundAdapter({ secretKey: provider.secretKey }, fetcher)],
    };
  }
  return { paymentAdapters: [], refundAdapters: [] };
}
