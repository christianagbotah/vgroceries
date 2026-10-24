import { createHash } from "node:crypto";
import type { HubtelPaymentConfig } from "../config";
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

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

const HUBTEL_REQUEST_MONEY_MAX_MINOR = 3_000_000;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(source: JsonRecord | null, ...keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function basicAuth(config: HubtelPaymentConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

function endpoint(template: string, values: Record<string, string | undefined>) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = values[name];
    if (!value) throw new Error(`Hubtel endpoint template requires ${name}.`);
    return encodeURIComponent(value);
  });
}

function state(value: unknown): PaymentProviderObservation["state"] {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["paid", "success", "successful", "completed", "complete"].includes(normalized)) return "succeeded";
  if (["failed", "failure", "cancelled", "canceled", "declined", "reversed"].includes(normalized)) return "failed";
  if (normalized === "expired") return "expired";
  if (["pending", "processing", "initiated", "unpaid", "ongoing", "queued"].includes(normalized)) return "pending";
  return "unknown";
}

function moneyMinor(value: unknown) {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(amount * 100 - minor) > 1e-7) return undefined;
  return minor;
}

function timestamp(source: JsonRecord | null) {
  for (const key of ["transactionDate", "transaction_date", "updatedAt", "updated_at", "date", "time"]) {
    const value = source?.[key];
    if (typeof value !== "string" || !value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return undefined;
}

export class HubtelPaymentProvider implements PaymentProviderAdapter {
  readonly id = "hubtel";

  constructor(
    private readonly config: HubtelPaymentConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      // Request Money is enabled first for Ghana mobile-money checkout. Card
      // activation remains closed until its exact merchant flow/refund parity is verified.
      methods: ["mobile_money"],
      trustMode: "lookup_required",
      safeInitiationRetry: false,
    };
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    if (input.method !== "mobile_money") {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_METHOD_UNSUPPORTED",
        customerSafeMessage: "This Hubtel payment method is not enabled yet.",
      };
    }
    if (!input.payerPhone) {
      return {
        kind: "rejected",
        failureCode: "PAYER_PHONE_REQUIRED",
        customerSafeMessage: "A Ghana mobile number is required to start this payment.",
      };
    }
    if (input.amountMinor <= 0 || input.amountMinor > HUBTEL_REQUEST_MONEY_MAX_MINOR) {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_AMOUNT_OUT_OF_RANGE",
        customerSafeMessage: "This payment amount is outside the provider's Request Money limit.",
      };
    }

    const response = await this.fetcher(
      endpoint(this.config.requestMoneyUrl, { mobileNumber: input.payerPhone }),
      {
        method: "POST",
        headers: {
          authorization: basicAuth(this.config),
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: Number((input.amountMinor / 100).toFixed(2)),
          title: "Variety Groceries",
          description: `Payment for ${input.orderReference}`,
          clientReference: input.merchantReference,
          callbackUrl: this.config.callbackUrl,
          cancellationUrl: this.config.cancellationUrl,
          returnUrl: this.config.returnUrl,
        }),
        signal: input.signal,
        redirect: "error",
      },
    );

    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* handled below */ }
    const data = record(root?.data ?? root?.Data);
    if (!response.ok || !data) {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_INITIALIZE_REJECTED",
        customerSafeMessage: "The payment provider could not start this payment.",
      };
    }

    const clientReference = text(data, "clientReference", "ClientReference", "client_reference");
    const paylinkId = text(data, "paylinkId", "PaylinkId", "paylink_id");
    const paylinkUrl = text(data, "paylinkUrl", "PaylinkUrl", "paylink_url");
    if (!clientReference || clientReference !== input.merchantReference || !paylinkId || !paylinkUrl)
      throw new Error("Hubtel initiation response did not match the payment attempt.");
    const redirectUrl = new URL(paylinkUrl);
    if (redirectUrl.protocol !== "https:") throw new Error("Hubtel paylink must use HTTPS.");

    return {
      kind: "accepted",
      providerReference: paylinkId,
      action: { kind: "redirect", url: redirectUrl.toString() },
    };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    let root: JsonRecord | null = null;
    try { root = record(JSON.parse(input.rawBody.toString("utf8"))); } catch { /* invalid JSON */ }
    const data = record(root?.data ?? root?.Data);
    if (!root || !data) return { verification: "invalid" };

    const merchantReference = text(data, "clientReference", "ClientReference", "client_reference");
    const providerReference = text(data, "paylinkId", "PaylinkId", "paylink_id", "transactionId", "TransactionId", "transaction_id");
    if (!merchantReference && !providerReference) return { verification: "invalid" };

    const digest = createHash("sha256").update(input.rawBody).digest("hex");
    return {
      verification: "lookup_required",
      providerEventId: `hubtel:${providerReference ?? "callback"}:${digest}`,
      ...(merchantReference ? { merchantReference } : {}),
      ...(providerReference ? { providerReference } : {}),
    };
  }

  async lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const url = endpoint(this.config.statusUrl, {
      reference: input.merchantReference,
      clientReference: input.merchantReference,
      providerReference: input.providerReference,
      paylinkId: input.providerReference,
    });
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { authorization: basicAuth(this.config), accept: "application/json" },
      signal: input.signal,
      redirect: "error",
    });

    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* handled below */ }
    const data = record(root?.data ?? root?.Data) ?? root;
    if (!response.ok || !data) throw new Error("Hubtel payment status lookup failed.");

    const merchantReference = text(data, "clientReference", "ClientReference", "client_reference", "reference", "Reference")
      ?? input.merchantReference;
    const providerReference = text(data, "paylinkId", "PaylinkId", "paylink_id", "transactionId", "TransactionId", "transaction_id")
      ?? input.providerReference;
    const amountMinor = moneyMinor(data.amount ?? data.Amount);
    const providerTimestamp = timestamp(data);

    return {
      providerId: this.id,
      merchantReference,
      ...(providerReference ? { providerReference } : {}),
      state: state(data.status ?? data.Status),
      ...(amountMinor !== undefined ? { amountMinor, currency: "GHS" as const } : {}),
      ...(providerTimestamp ? { providerTimestamp } : {}),
    };
  }
}
