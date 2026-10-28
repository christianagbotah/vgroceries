import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaystackConfig } from "../config";
import type {
  PaymentProviderAdapter,
  PaymentProviderCapabilities,
  PaymentProviderEventInput,
  PaymentProviderEventVerification,
  PaymentProviderInitiationInput,
  PaymentProviderInitiationResult,
  PaymentProviderLookupInput,
  PaymentProviderObservation,
} from "./payment-provider";

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function responseJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return jsonRecord(await response.json());
  } catch {
    return null;
  }
}

function safeDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export class PaystackPaymentProvider implements PaymentProviderAdapter {
  readonly id = "paystack";

  constructor(
    private readonly config: PaystackConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      methods: ["hosted_checkout"],
      trustMode: "lookup_required",
      safeInitiationRetry: false,
    };
  }

  private headers() {
    return {
      authorization: `Bearer ${this.config.secretKey}`,
      "content-type": "application/json",
    };
  }

  private providerEmail(input: PaymentProviderInitiationInput): string | null {
    const real = input.payerEmail?.trim().toLowerCase();
    if (real) return real;
    if (!input.payerPhone || !/^\+233\d{9}$/.test(input.payerPhone)) return null;
    const digest = createHmac("sha256", this.config.identityHmacKey)
      .update(input.payerPhone)
      .digest("hex")
      .slice(0, 32);
    return `paystack-${digest}@${this.config.technicalEmailDomain}`;
  }

  async initiate(
    input: PaymentProviderInitiationInput,
  ): Promise<PaymentProviderInitiationResult> {
    if (input.method !== "hosted_checkout") {
      return {
        kind: "rejected",
        failureCode: "unsupported_method",
        customerSafeMessage: "This electronic payment method is unavailable.",
      };
    }
    const email = this.providerEmail(input);
    if (!email) {
      return {
        kind: "rejected",
        failureCode: "payer_identity_missing",
        customerSafeMessage: "A valid customer phone or email is required for this payment.",
      };
    }

    const response = await this.fetcher(this.config.initializeUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        email,
        amount: String(input.amountMinor),
        currency: input.currency,
        reference: input.merchantReference,
        callback_url: this.config.callbackUrl,
        metadata: {
          attemptId: input.attemptId,
          orderReference: input.orderReference,
          ...(input.payerPhone ? { payerPhone: input.payerPhone } : {}),
        },
      }),
      signal: input.signal,
    });
    const body = await responseJson(response);
    const data = jsonRecord(body?.data);
    if (
      !response.ok ||
      body?.status !== true ||
      typeof data?.authorization_url !== "string" ||
      typeof data?.reference !== "string" ||
      data.reference !== input.merchantReference
    ) {
      return {
        kind: "rejected",
        failureCode: `paystack_initialize_${response.status}`,
        customerSafeMessage: "The payment provider could not start this payment.",
      };
    }
    return {
      kind: "accepted",
      providerReference: data.reference,
      action: { kind: "redirect", url: data.authorization_url },
    };
  }

  async verifyEvent(
    input: PaymentProviderEventInput,
  ): Promise<PaymentProviderEventVerification> {
    const rawSignature = input.headers["x-paystack-signature"];
    const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature))
      return { verification: "invalid" };
    const expected = createHmac("sha512", this.config.secretKey)
      .update(input.rawBody)
      .digest();
    const supplied = Buffer.from(signature, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return { verification: "invalid" };

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = jsonRecord(JSON.parse(input.rawBody.toString("utf8")));
    } catch {
      return { verification: "invalid" };
    }
    const data = jsonRecord(parsed?.data);
    if (!data || typeof data.reference !== "string" || !data.reference)
      return { verification: "invalid" };
    const providerEventId =
      typeof data.id === "number" || typeof data.id === "string"
        ? String(data.id)
        : undefined;
    return {
      verification: "lookup_required",
      merchantReference: data.reference,
      providerReference: data.reference,
      ...(providerEventId ? { providerEventId } : {}),
    };
  }

  async lookup(
    input: PaymentProviderLookupInput,
  ): Promise<PaymentProviderObservation> {
    const url = this.config.verifyUrl.replace(
      "{reference}",
      encodeURIComponent(input.merchantReference),
    );
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { authorization: `Bearer ${this.config.secretKey}` },
      signal: input.signal,
    });
    const body = await responseJson(response);
    const data = jsonRecord(body?.data);
    if (!response.ok || body?.status !== true || !data) {
      return {
        providerId: this.id,
        merchantReference: input.merchantReference,
        providerReference: input.providerReference,
        state: "unknown",
      };
    }

    const observedReference =
      typeof data.reference === "string" ? data.reference : input.merchantReference;
    const rawStatus = typeof data.status === "string" ? data.status.toLowerCase() : "";
    let state: PaymentProviderObservation["state"] = "unknown";
    if (rawStatus === "success") state = "succeeded";
    else if (["ongoing", "pending", "processing", "queued"].includes(rawStatus)) state = "pending";
    else if (rawStatus === "failed") state = "failed";
    else if (rawStatus === "abandoned") state = "expired";

    const rawAmount = data.amount;
    const amountMinor =
      typeof rawAmount === "number" && Number.isSafeInteger(rawAmount) && rawAmount > 0
        ? rawAmount
        : undefined;
    const currency = data.currency === "GHS" ? "GHS" : undefined;
    if (state === "succeeded" && (!amountMinor || currency !== "GHS")) state = "unknown";
    const rawChannel = typeof data.channel === "string" ? data.channel.toLowerCase() : "";
    const settledChannel = /^[a-z0-9_]{1,64}$/.test(rawChannel) ? rawChannel : undefined;

    return {
      providerId: this.id,
      merchantReference: observedReference,
      providerReference: observedReference,
      state,
      ...(amountMinor ? { amountMinor } : {}),
      ...(currency ? { currency } : {}),
      ...(settledChannel ? { settledChannel } : {}),
      ...(rawStatus === "failed" ? { failureCode: "paystack_failed" } : {}),
      ...(safeDate(data.paid_at ?? data.created_at)
        ? { providerTimestamp: safeDate(data.paid_at ?? data.created_at) }
        : {}),
    };
  }
}
