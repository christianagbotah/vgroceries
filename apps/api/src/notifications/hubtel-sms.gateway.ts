import type { HubtelSmsConfig } from "../config";

/**
 * Transport-only Hubtel SMS adapter. Does not enrol users, infer consent,
 * create messages or run a worker; callers must own opt-in, durable
 * deduplication, retry policy and recipient verification.
 *
 * Hubtel status=0 means ACCEPTED FOR DELIVERY, not proof of delivery.
 * Network timeouts are indeterminate: do not automatically retry an uncertain
 * acceptance because the customer may otherwise receive duplicate SMS.
 */
export type SmsSendOutcome =
  | { state: "accepted"; providerMessageId: string }
  | { state: "rejected"; reason: "provider_rejected" | "rate_limited" | "unavailable" };

export function normalizeGhanaMobile(value: string): string | null {
  if (typeof value !== "string") return null;
  const number = value.trim();
  if (/^0[25][0-9]{8}$/.test(number)) return "233" + number.slice(1);
  if (/^\+?233[25][0-9]{8}$/.test(number)) return number.replace(/^\+/, "");
  return null;
}

export class HubtelSmsGateway {
  constructor(
    private readonly config: HubtelSmsConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!["https://sms.hubtel.com", "https://smsc.hubtel.com"].includes(config.baseUrl))
      throw new Error("Unsupported SMS gateway origin");
    if (!/^[a-zA-Z0-9]{1,11}$/.test(config.senderId))
      throw new Error("Invalid SMS sender ID");
    if (!config.clientId || !config.clientSecret)
      throw new Error("SMS credentials are required");
    if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 500 || config.timeoutMs > 20000)
      throw new Error("Invalid SMS timeout");
  }

  async send(to: string, content: string): Promise<SmsSendOutcome> {
    const recipient = normalizeGhanaMobile(to);
    if (!recipient) throw new Error("Invalid Ghana mobile number");
    if (typeof content !== "string" || content.length < 3 || content.length > 320
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content))
      throw new Error("Invalid transactional SMS content");

    // SMS uses independently approved sender credentials, not payment keys.
    const basic = Buffer.from(this.config.clientId + ":" + this.config.clientSecret).toString("base64");
    const personal = this.config.baseUrl === "https://smsc.hubtel.com";
    const payload = personal
      ? { from: this.config.senderId, to: recipient, content }
      : { From: this.config.senderId, To: recipient, Content: content };
    const response = await this.fetcher(this.config.baseUrl + "/v1/messages/send", {
      method: "POST",
      headers: {
        "authorization": "Basic " + basic,
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      redirect: "error",
    });
    if (response.status === 429) return { state: "rejected", reason: "rate_limited" };
    if (response.status === 503 || response.status === 502)
      return { state: "rejected", reason: "unavailable" };
    if (!response.ok) return { state: "rejected", reason: "provider_rejected" };

    // Invalid/partial success means UNKNOWN outcome, not safe to retry blindly.
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error("SMS provider returned an indeterminate response"); }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("SMS provider returned an indeterminate response");
    const result = body as Record<string, unknown>;
    const status = result.status ?? result.Status;
    if (status !== 0 && status !== "0") return { state: "rejected", reason: "provider_rejected" };
    const messageId = result.messageId ?? result.MessageId;
    if (typeof messageId !== "string" || messageId.length < 1 || messageId.length > 128)
      throw new Error("SMS provider acceptance is missing a message ID");
    return { state: "accepted", providerMessageId: messageId };
  }
}
