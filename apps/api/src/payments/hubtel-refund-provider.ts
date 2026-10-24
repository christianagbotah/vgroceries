import type { HubtelRefundConfig } from "../config";
import type {
  RefundProviderAdapter,
  RefundProviderCapabilities,
  RefundProviderInitiationInput,
  RefundProviderInitiationResult,
  RefundProviderLookupInput,
  RefundProviderObservation,
} from "./refund-provider";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type HubtelRefundResponse = {
  responseCode?: unknown;
  message?: unknown;
  data?: { orderId?: unknown; amount?: unknown; externalTransactionId?: unknown } | null;
};

const MAX_REFUND_AGE_MS = 45 * 24 * 60 * 60 * 1000;

function safeRejection(code: string): string {
  if (code === "3000") return "The original Hubtel transaction could not be found.";
  if (code === "4000") return "The original Hubtel transaction is below the provider refund minimum.";
  if (code === "4509") return "The original Hubtel transaction is not eligible for a provider refund.";
  return "Hubtel could not accept this refund request.";
}

function decimalCedisToMinor(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const minor = Math.round(value * 100);
  return Math.abs(value * 100 - minor) < 1e-7 ? minor : undefined;
}

export class HubtelRefundProvider implements RefundProviderAdapter {
  readonly id = "hubtel";

  constructor(
    private readonly config: HubtelRefundConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  capabilities(): RefundProviderCapabilities {
    return {
      methods: ["mobile_money"],
      lookupSupported: false,
      safeRetryAfterDefinitiveFailure: false,
      safeRetryAfterNoRecord: false,
      safeRetryAfterUnknown: false,
    };
  }

  private callbackUrl() {
    return `${this.config.callbackOrigin}/api/v1/refunds/providers/hubtel/callback/${this.config.callbackSecret}`;
  }

  private localEligibility(input: RefundProviderInitiationInput): RefundProviderInitiationResult | null {
    if (input.method !== "mobile_money")
      return { kind: "rejected", failureCode: "HUBTEL_METHOD_UNSUPPORTED", customerSafeMessage: "Hubtel refunds are available only for eligible mobile-money payments." };
    if (!input.originalPaymentProviderReference)
      return { kind: "rejected", failureCode: "HUBTEL_ORDER_ID_MISSING", customerSafeMessage: "The original Hubtel transaction reference is unavailable." };
    if (input.amountMinor !== input.originalPaymentAmountMinor)
      return { kind: "rejected", failureCode: "HUBTEL_PARTIAL_REFUND_UNSUPPORTED", customerSafeMessage: "This Hubtel refund endpoint supports only a refund of the original transaction amount." };
    if (input.amountMinor < 100)
      return { kind: "rejected", failureCode: "4000", customerSafeMessage: safeRejection("4000") };
    if (!input.originalPaymentResolvedAt || Date.now() - input.originalPaymentResolvedAt.getTime() > MAX_REFUND_AGE_MS)
      return { kind: "rejected", failureCode: "HUBTEL_REFUND_AGE_LIMIT", customerSafeMessage: "This transaction is outside Hubtel's API refund window." };
    return null;
  }

  async initiateRefund(input: RefundProviderInitiationInput): Promise<RefundProviderInitiationResult> {
    const local = this.localEligibility(input);
    if (local) return local;

    const orderId = input.originalPaymentProviderReference!;
    const url = `${this.config.baseUrl}/refund/${encodeURIComponent(this.config.collectionAccount)}/order/${encodeURIComponent(orderId)}`;
    const authorization = Buffer.from(`${this.config.basicUsername}:${this.config.basicPassword}`, "utf8").toString("base64");
    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Basic ${authorization}`,
        "cache-control": "no-cache",
      },
      body: JSON.stringify({ callbackUrl: this.callbackUrl() }),
      signal: input.signal,
      redirect: "error",
    });

    let payload: HubtelRefundResponse;
    try {
      payload = (await response.json()) as HubtelRefundResponse;
    } catch {
      throw new Error("Hubtel refund response was not valid JSON");
    }
    const code = typeof payload.responseCode === "string" ? payload.responseCode : "";
    const returnedOrderId = typeof payload.data?.orderId === "string" ? payload.data.orderId : undefined;

    if (code === "0001" || code === "4515") {
      return { kind: "accepted", state: "pending", providerRefundReference: returnedOrderId ?? orderId };
    }
    if (["3000", "4000", "4509"].includes(code)) {
      return { kind: "rejected", failureCode: code, customerSafeMessage: safeRejection(code) };
    }
    if (code === "0000") {
      const amountMinor = decimalCedisToMinor(payload.data?.amount);
      const providerRefundReference = typeof payload.data?.externalTransactionId === "string"
        ? payload.data.externalTransactionId
        : returnedOrderId;
      if (amountMinor === undefined)
        throw new Error("Hubtel refund success response did not contain a valid amount");
      return { kind: "accepted", state: "succeeded", providerRefundReference, amountMinor, currency: "GHS" };
    }

    throw new Error(`Unexpected Hubtel refund response (${response.status || "unknown"}/${code || "no-code"})`);
  }

  async lookupRefund(input: RefundProviderLookupInput): Promise<RefundProviderObservation> {
    return {
      providerId: this.id,
      merchantRefundReference: input.merchantRefundReference,
      providerRefundReference: input.providerRefundReference,
      state: "unknown",
      customerSafeMessage: "Hubtel's documented refund flow completes by callback; no refund lookup endpoint is configured.",
    };
  }
}
