import { createHash } from "node:crypto";
import type {
  PaymentProviderAdapter, PaymentProviderCapabilities, PaymentProviderEventInput,
  PaymentProviderEventVerification, PaymentProviderInitiationInput,
  PaymentProviderInitiationResult, PaymentProviderLookupInput, PaymentProviderObservation,
} from "./payment-provider";

/**
 * Hubtel Online Checkout, documented 12 October 2026.
 *
 * Deliberately NOT registered in bootstrap.ts: the existing refund authority
 * does not yet support all payment methods this hosted page can accept.
 * The current Hubtel Request Money adapter remains unchanged until cutover.
 *
 * No credentials are read from the browser. This client only runs server-side.
 */
export interface HubtelOnlineCheckoutConfig {
  apiId: string;
  apiKey: string;
  collectionAccount: string;
  callbackUrl: string;
  returnUrl: string;
  cancellationUrl: string;
  initiateUrl?: string;
  statusUrl?: string;
}

type Json = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const object = (v: unknown): Json | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : null;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

function minor(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  const converted = Math.round(value * 100);
  return Number.isSafeInteger(converted) && Math.abs(converted - value * 100) < 1e-7
    ? converted : undefined;
}

export class HubtelOnlineCheckoutProvider implements PaymentProviderAdapter {
  readonly id = "hubtel_checkout";

  constructor(
    private readonly config: HubtelOnlineCheckoutConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (!/^\d{3,32}$/.test(config.collectionAccount))
      throw new Error("Hubtel collection account must contain digits only.");
  }

  capabilities(): PaymentProviderCapabilities {
    return { methods: ["hosted_checkout"], trustMode: "lookup_required", safeInitiationRetry: false };
  }

  private auth() {
    return `Basic ${Buffer.from(`${this.config.apiId}:${this.config.apiKey}`, "utf8").toString("base64")}`;
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    if (input.method !== "hosted_checkout")
      return { kind: "rejected", failureCode: "HUBTEL_METHOD_UNSUPPORTED" };
    // Hubtel Online Checkout's clientReference limit is 32, whereas the older
    // Variety merchant-reference generator currently emits 39 characters.
    // Keep this adapter fail-closed until that generator is migrated and tested.
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(input.merchantReference))
      return { kind: "rejected", failureCode: "HUBTEL_CLIENT_REFERENCE_INVALID",
        customerSafeMessage: "This payment reference is not supported." };
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
      return { kind: "rejected", failureCode: "HUBTEL_AMOUNT_INVALID" };
    if (input.currency !== "GHS")
      return { kind: "rejected", failureCode: "HUBTEL_CURRENCY_UNSUPPORTED" };

    const response = await this.fetcher(
      this.config.initiateUrl ?? "https://payproxyapi.hubtel.com/items/initiate",
      {
        method: "POST",
        headers: { authorization: this.auth(), accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          totalAmount: input.amountMinor / 100,
          description: `Variety Groceries order ${input.orderReference}`.replace(/[^a-zA-Z0-9 -]/g, " "),
          callbackUrl: this.config.callbackUrl,
          returnUrl: this.config.returnUrl,
          cancellationUrl: this.config.cancellationUrl,
          merchantAccountNumber: this.config.collectionAccount,
          clientReference: input.merchantReference,
          ...(input.payerName ? { payeeName: input.payerName } : {}),
          ...(input.payerPhone ? { payeeMobileNumber: input.payerPhone.replace(/^\+/, "") } : {}),
          ...(input.payerEmail ? { payeeEmail: input.payerEmail } : {}),
        }),
        signal: input.signal,
        redirect: "error",
      },
    );
    const payload = object(await response.json().catch(() => null));
    // The owner-supplied 12 October documentation nests these values under
    // "data". SweetMothersGH's onsite-checkout implementation also supports
    // top-level and PascalCase variants. Accept those representations ONLY
    // when the full authenticated response carries the documented success
    // code and exactly echoes our clientReference.
    const data = object(payload?.data ?? payload?.Data) ?? payload;
    const checkoutUrl = str(data?.checkoutUrl ?? data?.CheckoutUrl);
    const checkoutId = str(data?.checkoutId ?? data?.CheckoutId);
    const echoedReference = str(data?.clientReference ?? data?.ClientReference);
    const responseCode = str(payload?.responseCode ?? payload?.ResponseCode);
    if (!response.ok || responseCode !== "0000" || !checkoutUrl || !checkoutId
      || echoedReference !== input.merchantReference)
      return { kind: "rejected", failureCode: "HUBTEL_CHECKOUT_INITIATION_FAILED",
        customerSafeMessage: "The payment provider could not start checkout." };
    let parsed: URL;
    try { parsed = new URL(checkoutUrl); } catch { throw new Error("Invalid Hubtel checkout URL."); }
    if (parsed.protocol !== "https:") throw new Error("Hubtel checkout URL must use HTTPS.");
    // CheckoutId is not the transaction/order ID required by the refund API.
    // Do not store it as a payment provider reference; lookup returns the transaction ID.
    return { kind: "accepted", action: { kind: "redirect", url: parsed.toString() } };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    let payload: Json | null = null;
    try { payload = object(JSON.parse(input.rawBody.toString("utf8"))); }
    catch { return { verification: "invalid" }; }
    const data = object(payload?.Data ?? payload?.data);
    const merchantReference = str(data?.ClientReference ?? data?.clientReference);
    if (!merchantReference) return { verification: "invalid" };
    // Hubtel's supplied reference describes no cryptographic callback signature.
    // Treat callbacks as untrusted hints; always fetch authoritative status.
    return {
      verification: "lookup_required",
      merchantReference,
      providerEventId: `hubtel-checkout:${createHash("sha256").update(input.rawBody).digest("hex")}`,
    };
  }

  async lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const url = new URL(this.config.statusUrl ??
      `https://api-txnstatus.hubtel.com/transactions/${this.config.collectionAccount}/status`);
    url.searchParams.set("clientReference", input.merchantReference);
    const response = await this.fetcher(url.toString(), {
      method: "GET",
      headers: { authorization: this.auth(), accept: "application/json" },
      signal: input.signal,
      redirect: "error",
    });
    const payload = object(await response.json().catch(() => null));
    const data = object(payload?.data ?? payload?.Data);
    if (!response.ok || payload?.responseCode !== "0000" || !data)
      return { providerId: this.id, merchantReference: input.merchantReference, state: "unknown" };
    const returnedReference = str(data.clientReference);
    if (!returnedReference)
      return { providerId: this.id, merchantReference: input.merchantReference, state: "unknown" };
    const rawStatus = str(data.status)?.toLowerCase();
    let state: PaymentProviderObservation["state"] =
      rawStatus === "paid" ? "succeeded" : rawStatus === "unpaid" ? "pending" : "unknown";
    const amountMinor = minor(data.amount);
    const transactionId = str(data.transactionId);
    // Hubtel's documented Ghana status response may return a null currencyCode.
    // In that case, GHS is the account's currency; any other explicit code fails closed.
    const currency: "GHS" | undefined =
      data.currencyCode === "GHS" || data.currencyCode === null ? "GHS" : undefined;
    // No captured payment may be finalized without a durable Hubtel transaction ID.
    if (state === "succeeded" && (amountMinor === undefined || !currency || !transactionId))
      state = "unknown";
    const rawTimestamp = str(data.date);
    const date = rawTimestamp ? new Date(rawTimestamp) : null;
    const channel = str(data.paymentMethod)?.toLowerCase();
    return {
      providerId: this.id,
      merchantReference: returnedReference,
      ...(transactionId ? { providerReference: transactionId } : {}),
      state,
      ...(amountMinor !== undefined ? { amountMinor } : {}),
      ...(currency ? { currency } : {}),
      ...(channel && /^[a-z0-9_-]{1,64}$/.test(channel) ? { settledChannel: channel } : {}),
      ...(date && !Number.isNaN(date.valueOf()) ? { providerTimestamp: date } : {}),
    };
  }
}
