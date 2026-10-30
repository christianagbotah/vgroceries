import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { EtranzactConfig } from "../config";
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

function majorAmount(amountMinor: number): string | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  const whole = Math.floor(amountMinor / 100);
  const fraction = String(amountMinor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function minorAmount(value: string): number | undefined {
  const match = /^(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return undefined;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) && minor > 0 ? minor : undefined;
}

function safeField(value: string | undefined, max = 256): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= max ? normalized : undefined;
}

function normalizedChannel(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized && /^[a-z0-9_]{1,64}$/.test(normalized) ? normalized : undefined;
}

export class EtranzactPaymentProvider implements PaymentProviderAdapter {
  readonly id = "etranzact";

  constructor(
    private readonly config: EtranzactConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      methods: ["hosted_checkout"],
      trustMode: "verified_event",
      safeInitiationRetry: false,
    };
  }

  private providerEmail(input: PaymentProviderInitiationInput): string | null {
    const real = input.payerEmail?.trim().toLowerCase();
    if (real && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(real) && real.length <= 254) return real;
    if (!input.payerPhone || !/^\+233\d{9}$/.test(input.payerPhone)) return null;
    const digest = createHmac("sha256", this.config.identityHmacKey)
      .update(input.payerPhone)
      .digest("hex")
      .slice(0, 32);
    return `etranzact-${digest}@${this.config.technicalEmailDomain}`;
  }

  private providerPhone(value: string | undefined): string | null {
    if (!value || !/^\+233\d{9}$/.test(value)) return null;
    return `0${value.slice(4)}`;
  }

  private requestChecksum(amount: string, transactionId: string) {
    return createHash("md5")
      .update(`${amount}${this.config.terminalId}${transactionId}${this.config.responseUrl}${this.config.secretKey}`)
      .digest("hex");
  }

  private responseChecksum(success: string, amount: string, transactionId: string) {
    return createHash("md5")
      .update(`${success}${amount}${this.config.terminalId}${transactionId}${this.config.responseUrl}${this.config.secretKey}`)
      .digest();
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    if (input.method !== "hosted_checkout") {
      return {
        kind: "rejected",
        failureCode: "unsupported_method",
        customerSafeMessage: "This electronic payment method is unavailable.",
      };
    }
    const amount = majorAmount(input.amountMinor);
    const name = safeField(input.payerName, 120);
    const phone = this.providerPhone(input.payerPhone);
    const email = this.providerEmail(input);
    if (!amount || !name || !phone || !email) {
      return {
        kind: "rejected",
        failureCode: "payer_identity_missing",
        customerSafeMessage: "A valid customer name and Ghana phone number are required for this payment.",
      };
    }
    const description = `Variety Groceries order ${input.orderReference}`.slice(0, 200);
    return {
      kind: "accepted",
      providerReference: input.merchantReference,
      action: {
        kind: "form_post",
        url: this.config.initializeUrl,
        fields: {
          TERMINAL_ID: this.config.terminalId,
          RESPONSE_URL: this.config.responseUrl,
          TRANSACTION_ID: input.merchantReference,
          AMOUNT: amount,
          DESCRIPTION: description,
          EMAIL: email,
          PHONENO: phone,
          FULL_NAME: name,
          CURRENCY_CODE: "GHS",
          CHECKSUM: this.requestChecksum(amount, input.merchantReference),
          LOGO_URL: this.config.logoUrl,
        },
      },
    };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    if (!input.rawBody.length || input.rawBody.length > 64 * 1024) return { verification: "invalid" };
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(input.rawBody.toString("utf8"));
    } catch {
      return { verification: "invalid" };
    }
    const terminalId = safeField(params.get("TERMINAL_ID") ?? undefined, 64);
    const merchantReference = safeField(params.get("TRANSACTION_ID") ?? undefined, 128);
    const amountRaw = safeField(params.get("AMOUNT") ?? undefined, 64);
    const success = safeField(params.get("SUCCESS") ?? params.get("RESPONSE_CODE") ?? undefined, 32);
    const finalChecksum = safeField(params.get("FINAL_CHECKSUM") ?? undefined, 64);
    if (
      terminalId !== this.config.terminalId ||
      !merchantReference ||
      !amountRaw ||
      !success ||
      !finalChecksum ||
      !/^[a-f0-9]{32}$/i.test(finalChecksum)
    ) return { verification: "invalid" };

    const expected = this.responseChecksum(success, amountRaw, merchantReference);
    const supplied = Buffer.from(finalChecksum, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return { verification: "invalid" };

    const amountMinor = minorAmount(amountRaw);
    const currency = params.get("CURRENCY_CODE") === "GHS" ? "GHS" as const : undefined;
    if (!amountMinor || !currency) return { verification: "invalid" };

    let state: PaymentProviderObservation["state"];
    if (success === "0") state = "succeeded";
    else if (success.toUpperCase() === "P") state = "pending";
    else state = "failed";

    const providerReference = safeField(params.get("TRANS_NUM") ?? undefined, 128);
    const settledChannel = normalizedChannel(params.get("CARD_TYPE") ?? undefined);
    const observation: PaymentProviderObservation = {
      providerId: this.id,
      merchantReference,
      ...(providerReference ? { providerReference, providerEventId: providerReference } : {}),
      state,
      amountMinor,
      currency,
      ...(settledChannel ? { settledChannel } : {}),
      ...(state === "failed" ? {
        failureCode: `etranzact_${success.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "failed"}`,
        ...(safeField(params.get("STATUS_REASON") ?? undefined, 500)
          ? { customerSafeMessage: safeField(params.get("STATUS_REASON") ?? undefined, 500) }
          : {}),
      } : {}),
    };
    return {
      verification: "verified",
      ...(providerReference ? { providerEventId: providerReference } : {}),
      observation,
    };
  }

  async lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const response = await this.fetcher(this.config.queryUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ TRANSACTION_ID: input.merchantReference }).toString(),
      signal: input.signal,
    });
    if (!response.ok)
      throw new Error(`eTranzact requery request failed with HTTP ${response.status}.`);
    return {
      providerId: this.id,
      merchantReference: input.merchantReference,
      providerReference: input.providerReference,
      state: "pending",
      customerSafeMessage: "Payment verification has been requested from eTranzact.",
    };
  }
}
