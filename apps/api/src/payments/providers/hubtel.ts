import { createHash } from "node:crypto";
import type {
  PaymentProviderAdapter,
  PaymentProviderCapabilities,
  PaymentProviderEventInput,
  PaymentProviderEventVerification,
  PaymentProviderInitiationInput,
  PaymentProviderInitiationResult,
  PaymentProviderLookupInput,
  PaymentProviderObservation,
} from "../payment-provider";

export interface HubtelProviderConfig {
  clientId: string;
  clientSecret: string;
  requestMoneyUrl: string;
  statusUrl: string;
  callbackUrl: string;
  returnUrl: string;
  cancellationUrl: string;
}

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length ? value.trim() : undefined;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function basicAuth(config: HubtelProviderConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

function replaceTemplate(template: string, values: Record<string, string | undefined>) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = values[name];
    if (!value) throw new Error(`Hubtel endpoint template requires ${name}.`);
    return encodeURIComponent(value);
  });
}

function statusState(value: unknown): PaymentProviderObservation["state"] {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["paid", "success", "successful", "completed", "complete"].includes(normalized)) return "succeeded";
  if (["failed", "failure", "cancelled", "canceled", "declined", "reversed"].includes(normalized)) return "failed";
  if (["expired"].includes(normalized)) return "expired";
  if (["pending", "processing", "initiated", "unpaid", "ongoing", "queued"].includes(normalized)) return "pending";
  return "unknown";
}

function moneyMinor(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function firstString(data: JsonRecord, names: string[]) {
  for (const name of names) {
    const value = stringValue(data[name]);
    if (value) return value;
  }
  return undefined;
}

function providerTimestamp(data: JsonRecord) {
  for (const name of ["transactionDate", "transaction_date", "updatedAt", "updated_at", "date", "time"]) {
    const value = dateValue(data[name]);
    if (value) return value;
  }
  return undefined;
}

export class HubtelPaymentAdapter implements PaymentProviderAdapter {
  readonly id = "hubtel";

  constructor(
    private readonly config: HubtelProviderConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      methods: ["mobile_money", "card_hosted"],
      trustMode: "lookup_required",
      safeInitiationRetry: false,
    };
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    if (!input.payerPhone) {
      return {
        kind: "rejected",
        failureCode: "PAYER_PHONE_REQUIRED",
        customerSafeMessage: "A Ghana mobile number is required to start this payment.",
      };
    }
    const response = await this.fetcher(
      replaceTemplate(this.config.requestMoneyUrl, { mobileNumber: input.payerPhone }),
      {
        method: "POST",
        headers: {
          authorization: basicAuth(this.config),
          "content-type": "application/json",
        },
        signal: input.signal,
        body: JSON.stringify({
          amount: Number((input.amountMinor / 100).toFixed(2)),
          title: "Variety Groceries",
          description: `Payment for ${input.orderReference}`,
          clientReference: input.merchantReference,
          callbackUrl: this.config.callbackUrl,
          cancellationUrl: this.config.cancellationUrl,
          returnUrl: this.config.returnUrl,
        }),
      },
    );
    let payload: JsonRecord | null = null;
    try { payload = record(await response.json()); } catch { /* invalid response */ }
    const data = record(payload?.data);
    if (!response.ok || !data) {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_INITIALIZE_REJECTED",
        customerSafeMessage: "The payment provider could not start this payment.",
      };
    }
    const clientReference = firstString(data, ["clientReference", "client_reference"]);
    const paylinkId = firstString(data, ["paylinkId", "paylink_id"]);
    const paylinkUrl = firstString(data, ["paylinkUrl", "paylink_url"]);
    if (!clientReference || clientReference !== input.merchantReference || !paylinkId || !paylinkUrl)
      throw new Error("Hubtel initiation response did not match the payment attempt.");
    return {
      kind: "accepted",
      providerReference: paylinkId,
      action: { kind: "redirect", url: paylinkUrl },
    };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    let payload: JsonRecord | null = null;
    try { payload = record(JSON.parse(input.rawBody.toString("utf8"))); } catch { /* invalid JSON */ }
    const data = record(payload?.data);
    if (!payload || !data) return { verification: "invalid" };
    const merchantReference = firstString(data, ["clientReference", "client_reference"]);
    const providerReference = firstString(data, ["paylinkId", "paylink_id", "transactionId", "transaction_id"]);
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
    const url = replaceTemplate(this.config.statusUrl, {
      reference: input.merchantReference,
      clientReference: input.merchantReference,
      providerReference: input.providerReference,
      paylinkId: input.providerReference,
    });
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { authorization: basicAuth(this.config) },
      signal: input.signal,
    });
    let payload: JsonRecord | null = null;
    try { payload = record(await response.json()); } catch { /* invalid response */ }
    const data = record(payload?.data) ?? payload;
    if (!response.ok || !data) throw new Error("Hubtel status lookup failed.");

    const merchantReference = firstString(data, ["clientReference", "client_reference", "reference"])
      ?? input.merchantReference;
    const providerReference = firstString(data, ["paylinkId", "paylink_id", "transactionId", "transaction_id"])
      ?? input.providerReference;
    const amountMinor = moneyMinor(data.amount);
    const timestamp = providerTimestamp(data);
    return {
      providerId: "hubtel",
      merchantReference,
      ...(providerReference ? { providerReference } : {}),
      state: statusState(data.status),
      ...(amountMinor !== undefined ? { amountMinor, currency: "GHS" as const } : {}),
      ...(timestamp ? { providerTimestamp: timestamp } : {}),
    };
  }
}
