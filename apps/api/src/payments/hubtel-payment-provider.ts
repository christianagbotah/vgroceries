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
      // Hosted checkout presents rails on Hubtel; Direct Request Money is a
      // separate, mutually-exclusive operation, not a fallback payment prompt.
      methods: this.config.onlineCheckout ? ["hosted_checkout"] : ["mobile_money"],
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
    if (this.config.directReceive) return this.initiateDirectReceive(input);
    if (!this.config.requestMoneyUrl || !this.config.statusUrl) return {
      kind: "rejected", failureCode: "HUBTEL_DIRECT_NOT_CONFIGURED",
      customerSafeMessage: "Direct Request Money is not configured.",
    };
    if (!/^VG-PAY-[0-9A-F]{1,25}$/.test(input.merchantReference) || input.merchantReference.length > 32) {
      return {
        kind: "rejected",
        failureCode: "HUBTEL_REFERENCE_TOO_LONG_OR_INVALID",
        customerSafeMessage: "This payment reference is not supported by the provider.",
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

  /** Official Hubtel RMP prompt; no paylink, no immediate paid assertion. */
  private async initiateDirectReceive(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    const config = this.config.directReceive!;
    // Never send a provider prompt with an unverified or arbitrary number.
    if (!/^VG-PAY-[0-9A-F]{1,25}$/.test(input.merchantReference) ||
        input.merchantReference.length > 32 ||
        !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 100 ||
        input.amountMinor > HUBTEL_REQUEST_MONEY_MAX_MINOR || input.currency !== "GHS")
      return { kind: "rejected", failureCode: "HUBTEL_DIRECT_INVALID_AMOUNT_OR_REFERENCE",
        customerSafeMessage: "The mobile money request does not meet the provider's limits." };
    if (!input.payerPhone || !/^\+233[0-9]{9}$/.test(input.payerPhone))
      return { kind: "rejected", failureCode: "HUBTEL_DIRECT_PAYER_PHONE_REQUIRED",
        customerSafeMessage: "A verified Ghana mobile money number is required." };
    if (!input.payerChannel || !["mtn-gh", "vodafone-gh", "tigo-gh"].includes(input.payerChannel))
      return { kind: "rejected", failureCode: "HUBTEL_DIRECT_CHANNEL_REQUIRED",
        customerSafeMessage: "Select the mobile money network for your number." };

    const response = await this.fetcher(
      endpoint(config.receiveUrl, { merchantAccountNumber: config.merchantAccountNumber }), {
        method: "POST",
        headers: { authorization: basicAuth(this.config), accept: "application/json",
          "content-type": "application/json" },
        body: JSON.stringify({
          CustomerName: input.payerName ?? "Variety Groceries Customer",
          CustomerMsisdn: input.payerPhone.slice(1),
          Channel: input.payerChannel,
          Amount: input.amountMinor / 100,
          Description: `Variety Groceries ${input.orderReference}`,
          ClientReference: input.merchantReference,
          PrimaryCallbackUrl: this.config.callbackUrl,
          ...(input.payerEmail ? { CustomerEmail: input.payerEmail } : {}),
        }),
        signal: input.signal,
        redirect: "error",
      },
    );
    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* never assume a charge failed */ }
    const code = text(root, "ResponseCode", "responseCode");
    // 2001/4103 are documented definitive provider rejections. A timeout,
    // unknown body or transient status is ambiguous: reconciliation first.
    if (code === "2001" || code === "4103")
      return { kind: "rejected", failureCode: code,
        customerSafeMessage: "Hubtel could not accept the mobile money request." };
    if (!response.ok || !["0001", "0000"].includes(code ?? ""))
      throw new Error("Hubtel Direct Receive initiation is unconfirmed; do not retry a new charge.");
    const data = record(root?.Data ?? root?.data);
    const echoedReference = text(data, "ClientReference", "clientReference");
    const providerReference = text(data, "TransactionId", "transactionId");
    if (!echoedReference || echoedReference !== input.merchantReference ||
        !providerReference || moneyMinor(data?.Amount ?? data?.amount) !== input.amountMinor)
      throw new Error("Hubtel Direct Receive response lacks matching merchant, transaction or amount evidence.");
    return {
      kind: "accepted",
      providerReference,
      action: { kind: "prompt", message:
        "A Mobile Money approval request has been submitted. Approve it on your own phone and check this order for the independently verified result. Do not pay a second time." },
    };
  }

  private async initiateHosted(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    const hosted = this.config.onlineCheckout;
    if (!hosted) return {
      kind: "rejected", failureCode: "HUBTEL_HOSTED_NOT_CONFIGURED",
      customerSafeMessage: "Hubtel secure checkout is not configured.",
    };
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
        input.currency !== "GHS" ||
        !/^VG-PAY-[0-9A-F]{1,25}$/.test(input.merchantReference) ||
        input.merchantReference.length > 32) return {
      kind: "rejected", failureCode: "HUBTEL_HOSTED_INVALID_AMOUNT_OR_REFERENCE",
      customerSafeMessage: "The checkout amount or reference is invalid.",
    };
    const description = `Grocery order ${input.orderReference.replace(/[^A-Za-z0-9 -]/g, " ").slice(0, 56)}`.trim();
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
        merchantAccountNumber: hosted.merchantAccountNumber,
        clientReference: input.merchantReference,
        callbackUrl: this.config.callbackUrl,
        returnUrl: this.config.returnUrl,
        cancellationUrl: this.config.cancellationUrl,
        ...(input.payerName ? { payeeName: input.payerName } : {}),
        ...(input.payerPhone ? { payeeMobileNumber: input.payerPhone.replace(/^\+/, "") } : {}),
        ...(input.payerEmail ? { payeeEmail: input.payerEmail } : {}),
      }),
      signal: input.signal,
      redirect: "error",
    });
    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* non-authoritative response */ }
    const data = record(root?.data ?? root?.Data);
    // HTTP 200 is insufficient. Unrecognized response, timeout or 0005
    // leaves the attempt uncertain and must never authorize another charge.
    if (!response.ok || text(root, "responseCode", "ResponseCode") !== "0000" ||
        text(root, "status", "Status")?.toLowerCase() !== "success" || !data)
      throw new Error("Hubtel Online Checkout initiation could not be confirmed.");
    const reference = text(data, "clientReference", "ClientReference");
    const checkoutId = text(data, "checkoutId", "CheckoutId");
    const checkoutUrl = text(data, "checkoutUrl", "CheckoutUrl");
    if (reference !== input.merchantReference || !checkoutId || !checkoutUrl)
      throw new Error("Hubtel Online Checkout response identity is incomplete or mismatched.");
    let uri: URL;
    try { uri = new URL(checkoutUrl); }
    catch { throw new Error("Hubtel Online Checkout returned an invalid payment URL."); }
    const sandbox = new URL(hosted.initiateUrl).hostname === "code.hubtel.com";
    const allowed = sandbox ? new Set(["code.hubtel.com", "pay.hubtel.com"]) : new Set(["pay.hubtel.com"]);
    if (uri.protocol !== "https:" || !allowed.has(uri.hostname) ||
        uri.username || uri.password || uri.port || uri.hash)
      throw new Error("Hubtel Online Checkout returned an untrusted payment URL.");
    // checkoutId is an initiation-session ID, NOT the later transactionId.
    // Keep the merchantReference as the durable server-owned correlation.
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
    if (this.config.onlineCheckout) {
      const hosted = this.config.onlineCheckout;
      const url = endpoint(hosted.statusUrl, {
        merchantAccountNumber: hosted.merchantAccountNumber,
        reference: input.merchantReference,
        clientReference: input.merchantReference,
      });
      return this.lookupCollectionStatus(url, input);
    }
    if (this.config.directReceive) {
      const direct = this.config.directReceive;
      const url = endpoint(direct.statusUrl, {
        merchantAccountNumber: direct.merchantAccountNumber,
        reference: input.merchantReference,
      });
      return this.lookupCollectionStatus(url, input);
    }
    if (!this.config.statusUrl) throw new Error("Hubtel Direct status is not configured.");
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

    // The URL contains our REQUESTED reference, but an unrelated Paid JSON
    // must never inherit it. Settlement requires an independently echoed
    // merchant identity in the provider's own response payload.
    const merchantReference = text(data, "clientReference", "ClientReference", "client_reference", "reference", "Reference");
    if (!merchantReference || merchantReference !== input.merchantReference)
      throw new Error("Hubtel payment status reference could not be verified.");
    // When initiation already recorded a provider-issued reference, this
    // status response must echo the SAME identifier independently. Never
    // manufacture an apparent match from the lookup input, even if the
    // merchant reference and the Paid label happen to match.
    const providerReference = text(data, "paylinkId", "PaylinkId", "paylink_id", "transactionId", "TransactionId", "transaction_id");
    if (input.providerReference && providerReference !== input.providerReference)
      throw new Error("Hubtel payment status provider reference could not be verified.");
    // Hubtel Ghana collections may return currencyCode:null. That absence is
    // acceptable for this GHS-only merchant account, but an EXPLICIT foreign
    // or contradictory currency must never be re-labelled GHS by the adapter.
    for (const field of ["currencyCode", "CurrencyCode", "currency", "Currency"] as const) {
      const stated = data[field];
      if (stated !== undefined && stated !== null &&
          (typeof stated !== "string" || stated.trim().toUpperCase() !== "GHS"))
        throw new Error("Hubtel payment status currency could not be verified.");
    }
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

  private async lookupCollectionStatus(
    url: string, input: PaymentProviderLookupInput,
  ): Promise<PaymentProviderObservation> {
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { authorization: basicAuth(this.config), accept: "application/json" },
      signal: input.signal,
      redirect: "error",
    });
    let root: JsonRecord | null = null;
    try { root = record(await response.json()); } catch { /* non-authoritative status */ }
    const data = record(root?.data ?? root?.Data);
    if (!response.ok || text(root, "responseCode", "ResponseCode") !== "0000" || !data)
      throw new Error("Hubtel collection status could not be verified.");

    const merchantReference = text(data, "clientReference", "ClientReference", "client_reference");
    if (!merchantReference || merchantReference !== input.merchantReference)
      throw new Error("Hubtel collection status merchant reference could not be verified.");
    // A Ghana collection may omit currencyCode or explicitly return null,
    // but an explicit foreign/contradictory code is non-authoritative.
    for (const field of ["currencyCode", "CurrencyCode", "currency", "Currency"] as const) {
      const code = data[field];
      if (code !== undefined && code !== null &&
          (typeof code !== "string" || code.trim().toUpperCase() !== "GHS"))
        throw new Error("Hubtel collection status currency could not be verified.");
    }
    const grossMinor = moneyMinor(data.amount ?? data.Amount);
    const chargeRaw = data.charges ?? data.Charges;
    const netRaw = data.amountAfterCharges ?? data.AmountAfterCharges;
    const chargesMinor = moneyMinor(chargeRaw);
    const netMinor = moneyMinor(netRaw);
    const fullBreakdown = chargeRaw != null && netRaw != null;
    const coherentFees = fullBreakdown && grossMinor !== undefined &&
      chargesMinor !== undefined && netMinor !== undefined &&
      grossMinor === netMinor + chargesMinor;
    const expected = input.expectedAmountMinor;
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected <= 0))
      throw new Error("Invalid immutable checkout amount for Hubtel status matching.");
    const hostedCheckout = Boolean(this.config.onlineCheckout);
    // Only hosted checkout has verified customer-gross vs merchant-net fee
    // semantics. Direct Receive Money's status requires the original gross
    // checkout amount, not a guessed fee-adjusted net.
    if (hostedCheckout && fullBreakdown && !coherentFees)
      throw new Error("Hubtel collection status reported contradictory fee evidence.");
    if (hostedCheckout && expected !== undefined && grossMinor !== expected &&
        netMinor === expected && !coherentFees)
      throw new Error("Hubtel collection status cannot prove its claimed net order amount.");
    // Real merchant status proof: original checkout ₵1.00, Hubtel customer
    // amount ₵1.01, fees ₵0.01, merchant net ₵1.00. Select the expected
    // order total only after independently proving gross = net + fees.
    const amountMinor = hostedCheckout && expected !== undefined && grossMinor !== expected &&
      coherentFees && netMinor === expected && chargesMinor! > 0 ? netMinor : grossMinor;
    const observedState = state(data.status ?? data.Status);
    const transactionId = text(data, "transactionId", "TransactionId");
    // Checkout session ID is intentionally NOT recorded as providerRef.
    // Once a status supplies a transaction ID, future queries must echo it.
    if (input.providerReference && transactionId !== input.providerReference)
      throw new Error("Hubtel collection status transaction reference could not be verified.");
    // Any terminal result, including a claimed Failed/Expired outcome, might
    // otherwise make an uncertain attempt retryable. Do not accept a terminal
    // classification without independently echoed money and transaction ID.
    if (["succeeded", "failed", "expired"].includes(observedState) &&
        (amountMinor === undefined || !transactionId))
      throw new Error("Hubtel terminal status lacks independently verified money and transaction identity.");
    const channelRaw = text(data, "paymentMethod", "PaymentMethod");
    const settledChannel = channelRaw?.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 48);
    const providerTimestamp = timestamp(data);
    return {
      providerId: this.id,
      merchantReference,
      ...(transactionId ? {
        providerReference: transactionId,
        providerEventId: `hubtel-txn:${transactionId}`,
      } : {}),
      state: observedState,
      ...(amountMinor !== undefined ? { amountMinor, currency: "GHS" as const } : {}),
      ...(settledChannel ? { settledChannel } : {}),
      ...(providerTimestamp ? { providerTimestamp } : {}),
    };
  }
}
