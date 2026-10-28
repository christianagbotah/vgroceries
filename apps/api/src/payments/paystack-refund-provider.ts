import type { PaystackConfig } from "../config";
import type {
  RefundProviderAdapter,
  RefundProviderCapabilities,
  RefundProviderInitiationInput,
  RefundProviderInitiationResult,
  RefundProviderLookupInput,
  RefundProviderObservation,
} from "./refund-provider";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

async function responseJson(response: Response): Promise<JsonRecord | null> {
  try {
    return record(await response.json());
  } catch {
    return null;
  }
}

function providerReference(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function amountMinor(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function timestamp(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function normalizeStatus(value: unknown): RefundProviderObservation["state"] {
  const status = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["processed", "success", "successful", "completed"].includes(status)) return "succeeded";
  if (["pending", "processing", "queued", "ongoing"].includes(status)) return "pending";
  if (["failed", "failure", "cancelled", "canceled", "rejected"].includes(status)) return "failed";
  return "unknown";
}

export class PaystackRefundProvider implements RefundProviderAdapter {
  readonly id = "paystack";

  constructor(
    private readonly config: PaystackConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  capabilities(): RefundProviderCapabilities {
    return {
      methods: ["hosted_checkout"],
      lookupSupported: true,
      safeRetryAfterDefinitiveFailure: false,
      safeRetryAfterNoRecord: false,
      safeRetryAfterUnknown: false,
    };
  }

  private headers() {
    return {
      authorization: `Bearer ${this.config.secretKey}`,
      "content-type": "application/json",
    };
  }

  async initiateRefund(
    input: RefundProviderInitiationInput,
  ): Promise<RefundProviderInitiationResult> {
    if (input.method !== "hosted_checkout") {
      return {
        kind: "rejected",
        failureCode: "paystack_refund_method_unsupported",
        customerSafeMessage: "This payment cannot be refunded through Paystack.",
      };
    }
    if (
      input.currency !== "GHS" ||
      input.amountMinor <= 0 ||
      input.amountMinor > input.originalPaymentAmountMinor
    ) {
      return {
        kind: "rejected",
        failureCode: "paystack_refund_amount_invalid",
        customerSafeMessage: "This refund amount is invalid.",
      };
    }

    const transaction =
      input.originalPaymentProviderReference ?? input.originalPaymentMerchantReference;
    if (!transaction) {
      return {
        kind: "rejected",
        failureCode: "paystack_transaction_missing",
        customerSafeMessage: "The original payment reference is unavailable.",
      };
    }

    const response = await this.fetcher(this.config.refundUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        transaction,
        amount: input.amountMinor,
        currency: input.currency,
        merchant_note: `Variety Groceries refund ${input.merchantRefundReference} for ${input.orderReference}`,
      }),
      signal: input.signal,
    });
    const body = await responseJson(response);
    const data = record(body?.data);

    if (!response.ok || body?.status !== true || !data) {
      if ([400, 404, 422].includes(response.status)) {
        return {
          kind: "rejected",
          failureCode: `paystack_refund_${response.status}`,
          customerSafeMessage: "The payment provider rejected this refund request.",
        };
      }
      throw new Error(`Paystack refund request failed with HTTP ${response.status}.`);
    }

    const reference = providerReference(data.id);
    const state = normalizeStatus(data.status);
    if (!reference || state === "unknown")
      throw new Error("Paystack refund response did not contain a usable refund identity/state.");

    if (state === "succeeded") {
      const observedAmount = amountMinor(data.amount);
      if (observedAmount !== input.amountMinor || data.currency !== "GHS")
        throw new Error("Paystack processed refund response did not match requested money identity.");
      return {
        kind: "accepted",
        state: "succeeded",
        providerRefundReference: reference,
        amountMinor: observedAmount,
        currency: "GHS",
      };
    }
    if (state === "failed") {
      return {
        kind: "rejected",
        failureCode: "paystack_refund_failed",
        customerSafeMessage: "The payment provider could not process this refund.",
      };
    }
    return { kind: "accepted", state: "pending", providerRefundReference: reference };
  }

  async lookupRefund(
    input: RefundProviderLookupInput,
  ): Promise<RefundProviderObservation> {
    if (!input.providerRefundReference) {
      return {
        providerId: this.id,
        merchantRefundReference: input.merchantRefundReference,
        state: "unknown",
        customerSafeMessage: "Paystack refund identity is unavailable for automatic lookup.",
      };
    }

    const url = this.config.refundLookupUrl.replace(
      "{id}",
      encodeURIComponent(input.providerRefundReference),
    );
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { authorization: `Bearer ${this.config.secretKey}` },
      signal: input.signal,
    });
    const body = await responseJson(response);
    const data = record(body?.data);
    if (response.status === 404) {
      return {
        providerId: this.id,
        merchantRefundReference: input.merchantRefundReference,
        providerRefundReference: input.providerRefundReference,
        state: "not_found",
      };
    }
    if (!response.ok || body?.status !== true || !data)
      throw new Error(`Paystack refund lookup failed with HTTP ${response.status}.`);

    const reference = providerReference(data.id) ?? input.providerRefundReference;
    let state = normalizeStatus(data.status);
    const observedAmount = amountMinor(data.amount);
    const currency = data.currency === "GHS" ? "GHS" as const : undefined;
    if (state === "succeeded" && (!observedAmount || !currency)) state = "unknown";
    const providerTimestamp =
      timestamp(data.refunded_at) ?? timestamp(data.updatedAt) ?? timestamp(data.createdAt);

    return {
      providerId: this.id,
      merchantRefundReference: input.merchantRefundReference,
      providerRefundReference: reference,
      state,
      ...(observedAmount ? { amountMinor: observedAmount } : {}),
      ...(currency ? { currency } : {}),
      ...(state === "failed" ? { failureCode: "paystack_refund_failed" } : {}),
      ...(providerTimestamp ? { providerTimestamp } : {}),
    };
  }
}
