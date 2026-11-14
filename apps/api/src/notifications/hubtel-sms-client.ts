/**
 * Server-only Hubtel SMS REST adapter (12 October 2026 API reference).
 * Not wired into the notifications outbox yet: no live messages are sent.
 * Mirrors iEduPro application/models/Sms_model.php: batch/simple endpoint,
 * Basic Auth, and { From, Recipients: [Ghana E.164 phone], Content }.
 * POST + Basic Auth deliberately avoids the documented GET route, which puts
 * ClientSecret and message content into URLs and potentially into access logs.
 */
export interface HubtelSmsConfig {
  clientId: string;
  clientSecret: string;
  senderId: string;
  baseUrl?: string;
}

export interface HubtelSmsSubmission {
  messageId?: string;
  state: "submitted";
  rate?: number;
}

export interface HubtelSmsDelivery {
  messageId: string;
  state: "delivered" | "sent" | "pending" | "failed" | "unknown";
  providerStatus?: string;
  updateTime?: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

/**
 * Accept Ghana formats supported by iEduPro application/models/Sms_model.php.
 * Reject malformed values instead of using permissive length-only checks.
 */
export function normalizeGhanaSmsRecipient(value: string): string | null {
  const trimmed = value.trim().replace(/[\s-]/g, "");
  const local = /^0(\d{9})$/.exec(trimmed);
  const national = /^(\d{9})$/.exec(trimmed);
  const international = /^\+?233(\d{9})$/.exec(trimmed);
  const duplicatedZero = /^\+?2330(\d{9})$/.exec(trimmed);
  const digits = local?.[1] ?? national?.[1] ??
    international?.[1] ?? duplicatedZero?.[1];
  return digits ? "+233" + digits : null;
}
const object = (v: unknown): Json | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : null;

export class HubtelSmsClient {
  private readonly baseUrl: string;
  constructor(
    private readonly config: HubtelSmsConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (!/^[a-zA-Z0-9]{1,11}$/.test(config.senderId))
      throw new Error("Hubtel SMS Sender ID must contain 1 to 11 alphanumeric characters.");
    this.baseUrl = config.baseUrl ?? "https://sms.hubtel.com";
    const parsed = new URL(this.baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash)
      throw new Error("Hubtel SMS base URL must be secure and contain no credentials.");
  }

  private auth() {
    return `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`, "utf8").toString("base64")}`;
  }

  async send(to: string, content: string, signal?: AbortSignal): Promise<HubtelSmsSubmission> {
    const phone = normalizeGhanaSmsRecipient(to);
    if (!phone) throw new Error("SMS recipient must be a Ghana mobile number.");
    if (!content.trim()) throw new Error("SMS content must not be empty.");
    const response = await this.fetcher(`${this.baseUrl}/v1/messages/batch/simple/send`, {
      method: "POST",
      headers: {
        authorization: this.auth(),
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ From: this.config.senderId, Recipients: [phone], Content: content }),
      signal,
      redirect: "error",
    });
    const data = object(await response.json().catch(() => null));
    if (!response.ok || (data?.status !== 0 && data?.status !== "0"))
      throw new Error("Hubtel did not accept the SMS submission.");
    // Hubtel batch responses can carry message IDs in different casing, or
    // omit them. An accepted submission is never proof of delivery.
    const messages = Array.isArray(data?.Messages) ? data.Messages : [];
    const first = object(messages[0]);
    const candidate = data?.messageid ?? data?.messageId ??
      data?.MessageId ?? first?.MessageId ?? first?.messageid;
    const messageId = typeof candidate === "string" && candidate ? candidate : undefined;
    return { ...(messageId ? { messageId } : {}), state: "submitted",
      ...(typeof data?.rate === "number" && Number.isFinite(data.rate) ? { rate: data.rate } : {}) };
  }

  async status(messageId: string, signal?: AbortSignal): Promise<HubtelSmsDelivery> {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(messageId)) throw new Error("Invalid SMS message ID.");
    const response = await this.fetcher(
      `${this.baseUrl}/v1/messages/${encodeURIComponent(messageId)}`,
      { method: "GET", headers: { authorization: this.auth(), accept: "application/json" },
        signal, redirect: "error" },
    );
    const data = object(await response.json().catch(() => null));
    if (!response.ok || !data || data.messageId !== messageId)
      throw new Error("Hubtel SMS status lookup failed.");
    const providerStatus = typeof data.status === "string" ? data.status : "";
    const normalized = providerStatus.toLowerCase();
    const state: HubtelSmsDelivery["state"] =
      normalized === "delivered" ? "delivered" :
      normalized === "sent" ? "sent" :
      normalized === "pending" ? "pending" :
      ["failed", "undeliverable", "rejected", "unrouteable", "blacklisted"].includes(normalized)
        ? "failed" : "unknown";
    return { messageId, state,
      ...(providerStatus ? { providerStatus } : {}),
      ...(typeof data.updateTime === "string" ? { updateTime: data.updateTime } : {}) };
  }
}
