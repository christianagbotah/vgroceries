import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

export interface OrderEmailConfig {
  enabled: boolean;
  from: string;
  sendmailPath: string;
}

export interface OrderEmailMessage {
  recipient: string;
  subject: string;
  body: string;
}

const mailbox = /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;

function validMailbox(value: string) {
  return typeof value === "string" && value.length <= 254 && mailbox.test(value) &&
    !/[\r\n\u0000-\u0020\u007f]/.test(value) && !value.includes("..");
}

export function validateOrderEmailConfig(config: OrderEmailConfig): void {
  if (!config.enabled) throw Error("Order email transport disabled.");
  if (!validMailbox(config.from) || !isAbsolute(config.sendmailPath) ||
      /[\u0000-\u0020\u007f]/.test(config.sendmailPath))
    throw Error("Order email transport configuration invalid.");
}

/** Build a plain-text MIME message; all user-derived fields remain in the body.
 * Base64 preserves Unicode currency and prevents body text becoming headers. */
export function buildOrderEmail(config: OrderEmailConfig, message: OrderEmailMessage): string {
  validateOrderEmailConfig(config);
  if (!validMailbox(message.recipient) || typeof message.subject !== "string" ||
      !/^[\x20-\x7e]{1,150}$/.test(message.subject) ||
      typeof message.body !== "string" || !message.body.trim() ||
      Buffer.byteLength(message.body, "utf8") > 16000 || /\u0000/.test(message.body))
    throw Error("Invalid order email message.");
  const encoded = Buffer.from(message.body, "utf8").toString("base64").match(/.{1,76}/g) ?? [];
  return [
    `From: Variety Groceries <${config.from}>`,
    `To: <${message.recipient}>`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "X-Auto-Response-Suppress: All",
    "", ...encoded, "",
  ].join("\r\n");
}

/** Acceptance by the configured local MTA is NOT inbox delivery.
 * Call only after a durable, independently validated delivery claim.
 * Timeouts and process errors are ambiguous; callers must not auto-resend. */
export async function sendOrderEmail(config: OrderEmailConfig, message: OrderEmailMessage): Promise<{accepted: true}> {
  const mime = buildOrderEmail(config, message);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.sendmailPath, ["-t", "-i", "-f", config.from],
      { stdio: ["pipe", "ignore", "ignore"], shell: false });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Order email transport outcome unknown."));
    }, 15000);
    child.on("error", () => { clearTimeout(timer); reject(Error("Order email transport outcome unknown.")); });
    child.on("close", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Order email transport outcome unknown."));
    });
    child.stdin.on("error", () => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(Error("Order email transport outcome unknown."));
    });
    child.stdin.end(mime);
  });
  return { accepted: true };
}
