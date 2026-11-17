import { createHmac, timingSafeEqual } from "node:crypto";
import type { FlutterwaveConfig } from "../config";
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

const record = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try { return record(await response.json()); } catch { return null; }
}

function minorUnits(value: unknown): number | undefined {
  // Provider money is in major units. Parse a decimal representation exactly
  // into pesewas; never treat floating display amounts as integer minor units.
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const raw = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return undefined;
  const [whole, fraction = ""] = raw.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

function safeDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Flutterwave v3 hosted checkout only. Provider owns MoMo networks, card and
 * applicable bank-payment UI. Never handles card credentials or wallet PIN.
 *
 * Webhook signatures are admission control, NOT financial truth. Every event
 * triggers a separate signed server-side verify-by-reference lookup.
 */
export class FlutterwavePaymentProvider implements PaymentProviderAdapter {
  readonly id = "flutterwave";

  constructor(
    private readonly config: FlutterwaveConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      methods: ["hosted_checkout"],
      trustMode: "lookup_required",
      safeInitiationRetry: false,
    };
  }

  private payerEmail(input: PaymentProviderInitiationInput): string | null {
    const real = input.payerEmail?.trim().toLowerCase();
    if (real && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(real)) return real;
    if (!input.payerPhone || !/^\+233\d{9}$/.test(input.payerPhone)) return null;
    const digest = createHmac("sha256", this.config.identityHmacKey)
      .update(input.payerPhone).digest("hex").slice(0, 32);
    return `flutterwave-${digest}@${this.config.technicalEmailDomain}`;
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    if (input.method !== "hosted_checkout") {
      return { kind: "rejected", failureCode: "unsupported_method", customerSafeMessage: "This electronic payment option is unavailable." };
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.currency !== "GHS") {
      return { kind: "rejected", failureCode: "invalid_amount", customerSafeMessage: "The payment total could not be verified." };
    }
    const email = this.payerEmail(input);
    if (!email) return {
      kind: "rejected",
      failureCode: "payer_identity_missing",
      customerSafeMessage: "Enter a valid contact phone number or email to continue securely.",
    };
    const response = await this.fetcher(this.config.initiateUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.secretKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        tx_ref: input.merchantReference,
        amount: (input.amountMinor / 100).toFixed(2),
        currency: "GHS",
        redirect_url: this.config.returnUrl,
        customer: {
          email,
          ...(input.payerName ? { name: input.payerName } : {}),
          ...(input.payerPhone ? { phonenumber: input.payerPhone } : {}),
        },
        customizations: { title: "Variety Groceries", description: input.orderReference },
        meta: { attemptId: input.attemptId, orderReference: input.orderReference },
        // Do NOT constrain payment_options; provider settings determine which
        // Ghanaian channels are genuinely available for this merchant.
      }),
      signal: input.signal,
    });
    const body = await readJson(response);
    const link = record(body?.data)?.link;
    if (!response.ok || body?.status !== "success" || typeof link !== "string") {
      return { kind: "rejected", failureCode: `flutterwave_initiate_${response.status}`,
        customerSafeMessage: "Secure payment could not be started. Please try again or contact support." };
    }
    try {
      const target = new URL(link);
      if (target.protocol !== "https:" || target.hostname !== "checkout.flutterwave.com" || target.username || target.password) {
        throw new Error("Untrusted hosted link");
      }
    } catch {
      return { kind: "rejected", failureCode: "invalid_provider_link", customerSafeMessage: "The payment provider returned an invalid checkout link." };
    }
    return { kind: "accepted", providerReference: input.merchantReference, action: { kind: "redirect", url: link } };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    const staticHeader = input.headers["verif-hash"];
    const signatureHeader = input.headers["flutterwave-signature"];
    const hashValue = Array.isArray(staticHeader) ? staticHeader[0] : staticHeader;
    const signatureValue = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const key = Buffer.from(this.config.webhookSecret, "utf8");
    const staticHash = Buffer.from(typeof hashValue === "string" ? hashValue : "", "utf8");
    const legacyValid = staticHash.length === key.length && timingSafeEqual(staticHash, key);
    const expectedSignature = createHmac("sha256", key).update(input.rawBody).digest();
    let hmacValid = false;
    if (typeof signatureValue === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(signatureValue)) {
      const supplied = Buffer.from(signatureValue, "base64");
      hmacValid = supplied.length === expectedSignature.length && timingSafeEqual(supplied, expectedSignature);
    }
    if (!legacyValid && !hmacValid) return { verification: "invalid" };
    let data: Record<string, unknown> | null = null;
    try { data = record(record(JSON.parse(input.rawBody.toString("utf8")))?.data); } catch { /* invalid JSON */ }
    const reference = data?.tx_ref;
    if (typeof reference !== "string" || !reference.trim()) return { verification: "invalid" };
    const id = data?.id;
    return {
      verification: "lookup_required",
      merchantReference: reference,
      providerReference: reference,
      ...((typeof id === "string" || typeof id === "number") ? { providerEventId: String(id) } : {}),
    };
  }

  async lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const unknown: PaymentProviderObservation = {
      providerId: this.id, merchantReference: input.merchantReference,
      providerReference: input.providerReference, state: "unknown",
    };
    const endpoint = new URL(this.config.lookupUrl);
    endpoint.searchParams.set("tx_ref", input.merchantReference);
    const response = await this.fetcher(endpoint.toString(), {
      headers: { authorization: `Bearer ${this.config.secretKey}`, accept: "application/json" },
      signal: input.signal,
    });
    const body = await readJson(response);
    const data = record(body?.data);
    if (!response.ok || body?.status !== "success" || !data || data.tx_ref !== input.merchantReference) return unknown;

    const rawStatus = typeof data.status === "string" ? data.status.toLowerCase() : "";
    let state: PaymentProviderObservation["state"] = "unknown";
    if (rawStatus === "successful") state = "succeeded";
    else if (["pending", "processing", "ongoing"].includes(rawStatus)) state = "pending";
    else if (rawStatus === "failed") state = "failed";
    else if (["cancelled", "expired"].includes(rawStatus)) state = "expired";

    const amountMinor = minorUnits(data.amount);
    const currency = data.currency === "GHS" ? "GHS" as const : undefined;
    if (state === "succeeded" && (!amountMinor || !currency)) state = "unknown";

    const paymentType = typeof data.payment_type === "string" ? data.payment_type.toLowerCase() : "";
    const cardType = typeof record(data.card)?.type === "string"
      ? String(record(data.card)?.type).toLowerCase() : "";
    let channel = paymentType.replace(/[^a-z0-9_]/g, "_").slice(0, 48);
    if (channel === "card" && ["visa", "mastercard"].includes(cardType)) channel += `_${cardType}`;
    const settledChannel = /^[a-z0-9_]{1,64}$/.test(channel) ? channel : undefined;
    const timestamp = safeDate(data.created_at);

    return {
      providerId: this.id,
      merchantReference: input.merchantReference,
      providerReference: typeof data.flw_ref === "string" ? data.flw_ref : input.merchantReference,
      state,
      ...(amountMinor ? { amountMinor } : {}),
      ...(currency ? { currency } : {}),
      ...(settledChannel ? { settledChannel } : {}),
      ...(rawStatus === "failed" ? { failureCode: "flutterwave_failed" } : {}),
      ...(timestamp ? { providerTimestamp: timestamp } : {}),
    };
  }
}
