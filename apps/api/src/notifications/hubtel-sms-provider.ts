/** Hubtel SMS transport. Endpoint is explicitly configured, never guessed. */
export interface HubtelSmsConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  senderId: string;
}
export interface HubtelSmsResult { accepted: boolean; providerReference?: string }
export function validateHubtelSmsConfig(config: HubtelSmsConfig): void {
  // Reject raw URL syntax that WHATWG URL parsing would silently normalize.
  if (typeof config.endpoint !== "string" || /[\\\\\u0000-\u0020\u007f]/.test(config.endpoint)) {
    throw new Error("Hubtel SMS endpoint contains unsafe URL characters.");
  }
  const url = new URL(config.endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".hubtel.com") || url.hostname === ".hubtel.com" || url.username || url.password || url.search || url.hash || url.port) {
    throw new Error("Hubtel SMS endpoint must be an HTTPS hubtel.com URL without credentials or query parameters.");
  }
  if (![config.clientId, config.clientSecret, config.senderId].every(value => typeof value === "string" && value.trim().length > 0)) {
    throw new Error("Hubtel SMS credentials and sender ID are required.");
  }
  // Basic auth uses clientId:clientSecret; a colon in the ID changes the credential boundary.
  // Reject control characters in all provider-controlled identity fields before transmission.
  if (config.clientId.includes(":") || [config.clientId, config.clientSecret, config.senderId].some(value => /[\u0000-\u001f\u007f]/.test(value))) {
    throw new Error("Hubtel SMS credentials or sender ID contain unsafe characters.");
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
  if (!content.trim() || content.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) throw new Error("Invalid SMS content.");
  const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetcher(config.endpoint, {
    method: "POST", headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
    body: JSON.stringify({ From: config.senderId, To: recipient, Content: content }),
    signal: AbortSignal.timeout(10000),
    redirect: "error", // Never follow a redirect carrying provider authorization.
  });
  if (!response.ok) throw new Error(`Hubtel SMS transport HTTP ${response.status}`);
  // A successful HTTP transport is not proof the SMS gateway accepted the message.
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid Hubtel SMS response.");
  const data = body as Record<string, unknown>;
  const code = data.status ?? data.Status ?? data.ResponseCode ?? data.responseCode;
  const accepted = code === 0 || code === "0" || code === "0000" || code === "success" || code === "Success" || (code === undefined && data.submitted === true);
  if (!accepted) throw new Error("Hubtel SMS did not confirm acceptance.");
  const ref = data.messageId ?? data.MessageId;
  return { accepted: true, providerReference: typeof ref === "string" ? ref : undefined };
}
