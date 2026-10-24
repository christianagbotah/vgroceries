import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
import type {
  RefundProviderAdapter,
  RefundProviderCapabilities,
  RefundProviderInitiationInput,
  RefundProviderInitiationResult,
  RefundProviderLookupInput,
  RefundProviderObservation,
} from "../refund-provider";

const API_BASE = "https://api.paystack.co";
type FetchLike = typeof fetch;

type PaystackConfig = { secretKey: string; callbackUrl: string };
type PaystackRefundConfig = { secretKey: string };
type JsonRecord = Record<string, unknown>;

function authHeaders(secretKey: string, json = false) {
  return {
    authorization: `Bearer ${secretKey}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length ? value : undefined;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

async function jsonResponse(response: Response) {
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  return { response, body: record(body) };
}

function paymentState(value: unknown): PaymentProviderObservation["state"] {
  switch (value) {
    case "success": return "succeeded";
    case "failed":
    case "reversed": return "failed";
    case "abandoned": return "expired";
    case "ongoing":
    case "pending":
    case "processing":
    case "queued": return "pending";
    default: return "unknown";
  }
}

function refundState(value: unknown): RefundProviderObservation["state"] {
  switch (value) {
    case "processed":
    case "success": return "succeeded";
    case "failed": return "failed";
    case "pending":
    case "processing":
    case "needs-attention": return "pending";
    default: return "unknown";
  }
}

function providerOnlyPayerEmail(input: PaymentProviderInitiationInput, callbackUrl: string) {
  if (input.payerEmail) return input.payerEmail;
  if (!input.payerPhone) return undefined;
  const callbackHost = new URL(callbackUrl).hostname;
  const domain = callbackHost.includes(".") ? callbackHost : "payments.invalid";
  const identityHash = createHash("sha256")
    .update(input.payerPhone.replace(/\D/g, ""))
    .digest("hex")
    .slice(0, 24);
  return `customer-${identityHash}@${domain}`;
}

function providerTimestamp(data: JsonRecord) {
  return dateValue(data.paid_at) ?? dateValue(data.paidAt) ?? dateValue(data.refunded_at) ??
    dateValue(data.updatedAt) ?? dateValue(data.createdAt) ?? dateValue(data.transaction_date);
}

function header(input: PaymentProviderEventInput["headers"], name: string) {
  const match = Object.entries(input).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(match) ? match[0] : match;
}

function validSignature(rawBody: Buffer, signature: string | undefined, secretKey: string) {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const left = Buffer.from(signature.toLowerCase(), "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function observation(data: JsonRecord): PaymentProviderObservation {
  const reference = stringValue(data.reference) ?? "";
  const providerReference = data.id === undefined || data.id === null ? undefined : String(data.id);
  return {
    providerId: "paystack",
    merchantReference: reference,
    ...(providerReference ? { providerReference } : {}),
    state: paymentState(data.status),
    ...(integerValue(data.amount) !== undefined ? { amountMinor: integerValue(data.amount)! } : {}),
    ...(data.currency === "GHS" ? { currency: "GHS" as const } : {}),
    ...(providerTimestamp(data) ? { providerTimestamp: providerTimestamp(data) } : {}),
  };
}

export class PaystackPaymentAdapter implements PaymentProviderAdapter {
  readonly id = "paystack";
  constructor(private readonly config: PaystackConfig, private readonly fetcher: FetchLike = fetch) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      methods: ["mobile_money", "card_hosted", "bank_transfer"],
      trustMode: "verified_event",
      safeInitiationRetry: false,
    };
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    const payerEmail = providerOnlyPayerEmail(input, this.config.callbackUrl);
    if (!payerEmail)
      return { kind: "rejected", failureCode: "PAYER_CONTACT_REQUIRED", customerSafeMessage: "A phone number or email address is required to start this payment." };
    const response = await this.fetcher(`${API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: authHeaders(this.config.secretKey, true),
      signal: input.signal,
      body: JSON.stringify({
        email: payerEmail,
        amount: String(input.amountMinor),
        currency: input.currency,
        reference: input.merchantReference,
        callback_url: this.config.callbackUrl,
        metadata: JSON.stringify({
          attemptId: input.attemptId,
          orderReference: input.orderReference,
          payerName: input.payerName,
          ...(input.payerPhone ? { payerPhone: input.payerPhone } : {}),
        }),
      }),
    });
    const parsed = await jsonResponse(response);
    const data = record(parsed.body?.data);
    if (!response.ok || parsed.body?.status !== true || !data)
      return { kind: "rejected", failureCode: "PAYSTACK_INITIALIZE_REJECTED", customerSafeMessage: "The payment provider could not start this payment." };
    const reference = stringValue(data.reference);
    const url = stringValue(data.authorization_url);
    if (!reference || reference !== input.merchantReference || !url)
      throw new Error("Paystack initialization response did not match the payment attempt.");
    return { kind: "accepted", action: { kind: "redirect", url } };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    if (!validSignature(input.rawBody, header(input.headers, "x-paystack-signature"), this.config.secretKey))
      return { verification: "invalid" };
    let payload: JsonRecord | null = null;
    try { payload = record(JSON.parse(input.rawBody.toString("utf8"))); } catch { /* invalid JSON */ }
    if (!payload) return { verification: "invalid" };
    const event = stringValue(payload.event);
    const data = record(payload.data);
    if (!event || !data) return { verification: "invalid" };
    const reference = stringValue(data.reference);
    const providerReference = data.id === undefined || data.id === null ? undefined : String(data.id);
    const providerEventId = providerReference ? `paystack:${event}:${providerReference}` : `paystack:${event}:${createHmac("sha256", this.config.secretKey).update(input.rawBody).digest("hex")}`;
    if (event !== "charge.success")
      return { verification: "lookup_required", providerEventId, ...(reference ? { merchantReference: reference } : {}), ...(providerReference ? { providerReference } : {}) };
    const observed = observation(data);
    return { verification: "verified", providerEventId, observation: { ...observed, providerEventId } };
  }

  async lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const response = await this.fetcher(`${API_BASE}/transaction/verify/${encodeURIComponent(input.merchantReference)}`, {
      method: "GET",
      headers: authHeaders(this.config.secretKey),
      signal: input.signal,
    });
    const parsed = await jsonResponse(response);
    const data = record(parsed.body?.data);
    if (!response.ok || parsed.body?.status !== true || !data)
      throw new Error("Paystack transaction verification failed.");
    return observation(data);
  }
}

export class PaystackRefundAdapter implements RefundProviderAdapter {
  readonly id = "paystack";
  constructor(private readonly config: PaystackRefundConfig, private readonly fetcher: FetchLike = fetch) {}

  capabilities(): RefundProviderCapabilities {
    return {
      methods: ["mobile_money", "card_hosted", "bank_transfer"],
      lookupSupported: true,
      safeRetryAfterDefinitiveFailure: false,
      safeRetryAfterNoRecord: false,
      safeRetryAfterUnknown: false,
    };
  }

  async initiateRefund(input: RefundProviderInitiationInput): Promise<RefundProviderInitiationResult> {
    const response = await this.fetcher(`${API_BASE}/refund`, {
      method: "POST",
      headers: authHeaders(this.config.secretKey, true),
      signal: input.signal,
      body: JSON.stringify({
        transaction: input.originalPaymentProviderReference ?? input.originalPaymentMerchantReference,
        amount: input.amountMinor,
        currency: input.currency,
        merchant_note: `Variety Groceries refund ${input.merchantRefundReference}`,
      }),
    });
    const parsed = await jsonResponse(response);
    const data = record(parsed.body?.data);
    if (!response.ok || parsed.body?.status !== true || !data)
      return { kind: "rejected", failureCode: "PAYSTACK_REFUND_REJECTED", customerSafeMessage: "The payment provider could not start this refund." };
    const providerRefundReference = data.id === undefined || data.id === null ? undefined : String(data.id);
    const state = refundState(data.status);
    if (state === "failed")
      return { kind: "rejected", failureCode: "PAYSTACK_REFUND_FAILED", customerSafeMessage: "The payment provider rejected this refund." };
    if (state === "succeeded")
      return { kind: "accepted", state: "succeeded", ...(providerRefundReference ? { providerRefundReference } : {}), amountMinor: integerValue(data.amount) ?? input.amountMinor, currency: "GHS" };
    return { kind: "accepted", state: "pending", ...(providerRefundReference ? { providerRefundReference } : {}) };
  }

  async lookupRefund(input: RefundProviderLookupInput): Promise<RefundProviderObservation> {
    if (!input.providerRefundReference)
      return { providerId: "paystack", merchantRefundReference: input.merchantRefundReference, state: "unknown" };
    const response = await this.fetcher(`${API_BASE}/refund/${encodeURIComponent(input.providerRefundReference)}`, {
      method: "GET",
      headers: authHeaders(this.config.secretKey),
      signal: input.signal,
    });
    if (response.status === 404)
      return { providerId: "paystack", merchantRefundReference: input.merchantRefundReference, providerRefundReference: input.providerRefundReference, state: "not_found" };
    const parsed = await jsonResponse(response);
    const data = record(parsed.body?.data);
    if (!response.ok || parsed.body?.status !== true || !data)
      throw new Error("Paystack refund lookup failed.");
    return {
      providerId: "paystack",
      merchantRefundReference: input.merchantRefundReference,
      providerRefundReference: data.id === undefined || data.id === null ? input.providerRefundReference : String(data.id),
      state: refundState(data.status),
      ...(integerValue(data.amount) !== undefined ? { amountMinor: integerValue(data.amount)! } : {}),
      ...(data.currency === "GHS" ? { currency: "GHS" as const } : {}),
      ...(providerTimestamp(data) ? { providerTimestamp: providerTimestamp(data) } : {}),
    };
  }
}
