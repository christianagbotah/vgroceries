import { createHash, timingSafeEqual } from "node:crypto";
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

export interface ETranzactProviderConfig {
  terminalId: string;
  secretKey: string;
  checkoutUrl: string;
  queryUrl: string;
  responseUrl: string;
}

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

function sha256(...parts: string[]) {
  return createHash("sha256").update(parts.join(""), "utf8").digest("hex");
}

function safeEqualHex(left: string | undefined, right: string) {
  if (!left || !/^[0-9a-f]{64}$/i.test(left)) return false;
  const a = Buffer.from(left.toLowerCase(), "utf8");
  const b = Buffer.from(right.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function moneyString(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function moneyMinor(value: unknown) {
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return undefined;
  const valueNumber = Number(text);
  if (!Number.isFinite(valueNumber) || valueNumber < 0) return undefined;
  const minor = Math.round(valueNumber * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function stateFromSuccess(value: unknown): PaymentProviderObservation["state"] {
  const code = String(value ?? "").trim().toLowerCase();
  if (code === "0" || code === "success" || code === "successful") return "succeeded";
  if (code === "-1" || code === "-3" || code === "failed" || code === "failure") return "failed";
  if (code === "pending" || code === "processing") return "pending";
  return "unknown";
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function normalizeRecord(input: unknown): JsonRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const normalized: JsonRecord = {};
  for (const [key, value] of Object.entries(input as JsonRecord)) normalized[key.toUpperCase()] = value;
  return normalized;
}

function parseForm(raw: Buffer) {
  const params = new URLSearchParams(raw.toString("utf8"));
  const value: JsonRecord = {};
  for (const [key, entry] of params.entries()) value[key.toUpperCase()] = entry;
  return value;
}

async function parseProviderResponse(response: Response): Promise<JsonRecord | null> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try { return normalizeRecord(await response.json()); } catch { return null; }
  }
  try {
    const text = await response.text();
    const params = new URLSearchParams(text);
    const result: JsonRecord = {};
    for (const [key, value] of params.entries()) result[key.toUpperCase()] = value;
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export class ETranzactPaymentAdapter implements PaymentProviderAdapter {
  readonly id = "etranzact";

  constructor(
    private readonly config: ETranzactProviderConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  capabilities(): PaymentProviderCapabilities {
    return {
      methods: ["card_hosted"],
      trustMode: "verified_event",
      safeInitiationRetry: true,
    };
  }

  async initiate(input: PaymentProviderInitiationInput): Promise<PaymentProviderInitiationResult> {
    const amount = moneyString(input.amountMinor);
    const fields: Record<string, string> = {
      TERMINAL_ID: this.config.terminalId,
      TRANSACTION_ID: input.merchantReference,
      AMOUNT: amount,
      DESCRIPTION: `Payment for ${input.orderReference}`,
      RESPONSE_URL: this.config.responseUrl,
      CURRENCY_CODE: "GHS",
      ...(input.payerEmail ? { EMAIL: input.payerEmail } : {}),
      FULL_NAME: input.payerName,
      CHECKSUM: sha256(
        amount,
        this.config.terminalId,
        input.merchantReference,
        this.config.responseUrl,
        this.config.secretKey,
      ),
    };
    return {
      kind: "accepted",
      action: { kind: "form_post", url: this.config.checkoutUrl, fields },
    };
  }

  async verifyEvent(input: PaymentProviderEventInput): Promise<PaymentProviderEventVerification> {
    const fields = parseForm(input.rawBody);
    const success = typeof fields.SUCCESS === "string" ? fields.SUCCESS : undefined;
    const amount = typeof fields.AMOUNT === "string" ? fields.AMOUNT : undefined;
    const terminalId = typeof fields.TERMINAL_ID === "string" ? fields.TERMINAL_ID : undefined;
    const merchantReference = typeof fields.TRANSACTION_ID === "string" ? fields.TRANSACTION_ID : undefined;
    const responseUrl = typeof fields.RESPONSE_URL === "string" ? fields.RESPONSE_URL : undefined;
    const finalChecksum = typeof fields.FINAL_CHECKSUM === "string" ? fields.FINAL_CHECKSUM : undefined;
    if (!success || !amount || !terminalId || !merchantReference || !responseUrl ||
      terminalId !== this.config.terminalId || responseUrl !== this.config.responseUrl)
      return { verification: "invalid" };

    const expected = sha256(success, amount, terminalId, merchantReference, responseUrl, this.config.secretKey);
    if (!safeEqualHex(finalChecksum, expected)) return { verification: "invalid" };
    const amountMinor = moneyMinor(amount);
    if (amountMinor === undefined) return { verification: "invalid" };
    const providerEventId = `etranzact:${merchantReference}:${createHash("sha256").update(input.rawBody).digest("hex")}`;
    return {
      verification: "verified",
      providerEventId,
      observation: {
        providerId: "etranzact",
        merchantReference,
        providerEventId,
        state: stateFromSuccess(success),
        amountMinor,
        currency: "GHS",
      },
    };
  }

  async lookup(input: PaymentProviderLookupInput): Promise<PaymentProviderObservation> {
    const response = await this.fetcher(this.config.queryUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        TERMINAL_ID: this.config.terminalId,
        TRANSACTION_ID: input.merchantReference,
      }).toString(),
      signal: input.signal,
    });
    const data = await parseProviderResponse(response);
    if (!response.ok || !data) throw new Error("eTranzact transaction query failed.");
    const merchantReference = typeof data.TRANSACTION_ID === "string" && data.TRANSACTION_ID
      ? data.TRANSACTION_ID
      : input.merchantReference;
    const amountMinor = moneyMinor(data.TRANS_AMOUNT ?? data.AMOUNT);
    const timestamp = dateValue(data.TRANS_DATE ?? data.TRANSACTION_DATE);
    return {
      providerId: "etranzact",
      merchantReference,
      state: stateFromSuccess(data.SUCCESS),
      ...(amountMinor !== undefined ? { amountMinor, currency: "GHS" as const } : {}),
      ...(timestamp ? { providerTimestamp: timestamp } : {}),
    };
  }
}
