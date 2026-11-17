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
      // Hosted Checkout lets Hubtel select mobile money, card or wallet.
      // Direct Request Money remains a separate mobile-money-only mode.
      methods: this.config.onlineCheckout ? ["hosted_checkout", "mobile_money"] : ["mobile_money"],
      trustMode: "lookup_required",
      safeInitiationRetry: false,
    };
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    if (input.method === "hosted_checkout") return this.initiateHosted(input);
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


  private async initiateHosted(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    const hosted = this.config.onlineCheckout;
    if (!hosted) return {
      kind: "rejected",
      failureCode: "HUBTEL_HOSTED_NOT_CONFIGURED",
      customerSafeMessage: "Hubtel secure checkout is not available yet.",
    };
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
        input.currency !== "GHS" || input.merchantReference.length > 32) {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_HOSTED_INVALID_AMOUNT_OR_REFERENCE",
        customerSafeMessage: "The checkout amount or reference could not be verified.",
      };
    }
    const description = `Grocery order ${input.orderReference.replace(/[^A-Za-z0-9 -]/g, " ").slice(0, 56)}`.trim();
    // The amount is already authoritative in minor units. Provider takes
    // major-unit cedis and accepts at most two decimal places.
    const response = await this.fetcher(hosted.initiateUrl, {
      method: "POST",
      headers: {
        authorization: basicAuth(this.config),
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        totalAmount: Number((input.amountMinor / 100).toFixed(2)),
        description,
        callbackUrl: this.config.callbackUrl,
        returnUrl: this.config.returnUrl,
        cancellationUrl: this.config.cancellationUrl,
        merchantAccountNumber: hosted.merchantAccountNumber,
        clientReference: input.merchantReference,
        ...(input.payerName ? { payeeName: input.payerName } : {}),
        ...(input.payerPhone ? { payeeMobileNumber: input.payerPhone.replace(/^\+/, "") } : {}),
        ...(input.payerEmail ? { payeeEmail: input.payerEmail } : {}),
      }),
      signal: input.signal,
      redirect: "error",
    });
    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* reject invalid provider data */ }
    const data = record(root?.data ?? root?.Data);
    if (!response.ok || text(root, "responseCode", "ResponseCode") !== "0000" ||
        text(root, "status", "Status")?.toLowerCase() !== "success" || !data) {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_HOSTED_INITIALIZE_REJECTED",
        customerSafeMessage: "Hubtel could not open secure checkout. Please try again.",
      };
    }
    const reference = text(data, "clientReference", "ClientReference");
    const checkoutId = text(data, "checkoutId", "CheckoutId");
    const checkoutUrl = text(data, "checkoutUrl", "CheckoutUrl");
    if (reference !== input.merchantReference || !checkoutId || !checkoutUrl)
      throw new Error("Hubtel Online Checkout returned a mismatched or incomplete checkout.");
    let uri: URL;
    try { uri = new URL(checkoutUrl); }
    catch { throw new Error("Hubtel Online Checkout returned an invalid payment URL."); }
    // Hosted checkout redirects must remain on the merchant-selected Hubtel
    // payment domain. Sandbox links can be served from the Hubtel sandbox.
    const expectedHost = hosted.initiateUrl.includes("code.hubtel.com/sandbox/")
      ? new Set(["pay.hubtel.com", "code.hubtel.com"])
      : new Set(["pay.hubtel.com"]);
    if (uri.protocol !== "https:" || !expectedHost.has(uri.hostname) ||
        uri.username || uri.password || uri.port) {
      throw new Error("Hubtel Online Checkout returned an untrusted payment URL.");
    }
    // Do NOT store checkoutId as the provider transaction reference.
    // Hubtel's later status check returns a different transactionId; matching
    // those as though they were the same would cause a false settlement mismatch.
    // Merchant clientReference is the durable checkout correlation identifier.
    return { kind: "accepted", action: { kind: "redirect", url: uri.toString() } };
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
    // The official collection-status endpoint works for Online Checkout and
    // Direct Receive Money, and identifies the attempt by clientReference.
    const hostedStatus = this.config.onlineCheckout;
    const url = endpoint(hostedStatus?.statusUrl ?? this.config.statusUrl, {
      merchantAccountNumber: hostedStatus?.merchantAccountNumber,
      reference: input.merchantReference,
      clientReference: input.merchantReference,
      providerReference: input.providerReference,
      paylinkId: input.providerReference,
    });
    if (hostedStatus) return this.lookupCollectionStatus(url, input);
    return this.lookupRequestMoney(url, input);
  }

  private async lookupCollectionStatus(url: string, input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { authorization: basicAuth(this.config), accept: "application/json" },
      signal: input.signal,
      redirect: "error",
    });
    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* fail closed */ }
    const data = record(root?.data ?? root?.Data);
    if (!response.ok || text(root, "responseCode", "ResponseCode") !== "0000" || !data)
      throw new Error("Hubtel authoritative collection status is not available.");
    const merchantReference = text(data, "clientReference", "ClientReference");
    if (merchantReference !== input.merchantReference)
      throw new Error("Hubtel collection status reference does not match the payment attempt.");
    const amountMinor = moneyMinor(data.amount ?? data.Amount);
    const currencyCode = data.currencyCode ?? data.CurrencyCode;
    // Hubtel's published status example returns currencyCode: null for a
    // Ghanaian collection account. Our merchant collection is GHS-only.
    const currencyValid = currencyCode === null || currencyCode === undefined ||
      String(currencyCode).toUpperCase() === "GHS";
    let observedState = state(data.status ?? data.Status);
    if (observedState === "succeeded" && (amountMinor === undefined || !currencyValid))
      observedState = "unknown";
    const channelRaw = text(data, "paymentMethod", "PaymentMethod");
    const channel = channelRaw?.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 48);
    const transactionId = text(data, "transactionId", "TransactionId");
    return {
      providerId: this.id,
      merchantReference,
      ...(transactionId ? { providerReference: transactionId, providerEventId: `hubtel-txn:${transactionId}` } : {}),
      state: observedState,
      ...(amountMinor !== undefined ? { amountMinor, currency: currencyValid ? "GHS" as const : undefined } : {}),
      ...(channel ? { settledChannel: channel } : {}),
      ...(timestamp(data) ? { providerTimestamp: timestamp(data) } : {}),
    };
  }

  private async lookupRequestMoney(inputUrl: string, input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const url = inputUrl;
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
