/** Hubtel SMS transport. Endpoint is explicitly configured, never guessed. */
export interface HubtelSmsConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  senderId: string;
}
export interface HubtelSmsResult { accepted: boolean; providerReference?: string }
export function validateHubtelSmsConfig(config: HubtelSmsConfig): void {
  const url = new URL(config.endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".hubtel.com") || url.hostname === ".hubtel.com" || url.username || url.password || url.search || url.hash) {
    throw new Error("Hubtel SMS endpoint must be an HTTPS hubtel.com URL without credentials or query parameters.");
  }
  if (![config.clientId, config.clientSecret, config.senderId].every(value => typeof value === "string" && value.trim().length > 0)) {
    throw new Error("Hubtel SMS credentials and sender ID are required.");
  }
}
export async function sendHubtelSms(
  config: HubtelSmsConfig,
  recipient: string,
  content: string,
  fetcher: typeof fetch = fetch,
): Promise<HubtelSmsResult> {
  validateHubtelSmsConfig(config);
  if (!/^\+?[0-9]{9,15}$/.test(recipient)) throw new Error("Invalid SMS recipient.");
  if (!content || content.length > 1000) throw new Error("Invalid SMS content.");
  const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetcher(config.endpoint, {
    method: "POST", headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
    body: JSON.stringify({ From: config.senderId, To: recipient, Content: content }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Hubtel SMS transport HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid Hubtel SMS response.");
  const data = body as Record<string, unknown>;
  const code = data.Status ?? data.status ?? data.ResponseCode ?? data.responseCode;
  const accepted = code === 0 || code === "0" || code === "0000" || code === "success" || code === "Success";
  if (!accepted) throw new Error("Hubtel SMS did not confirm acceptance.");
  const ref = data.MessageId ?? data.messageId;
  return { accepted: true, providerReference: typeof ref === "string" ? ref : undefined };
}
