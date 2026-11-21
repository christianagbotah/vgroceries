import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Encrypt destinations at rest. The 32-byte key must be managed outside the database. */
export function encryptCustomerDestination(destination: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32 || !/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("Invalid message encryption key.");
  if (!destination.trim() || destination.length > 320) throw new Error("Invalid message destination.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(destination, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}
export function decryptCustomerDestination(encrypted: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32 || !/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("Invalid message encryption key.");
  const [version, iv, ciphertext, tag, extra] = encrypted.split(".");
  if (version !== "v1" || !iv || !ciphertext || !tag || extra) throw new Error("Invalid encrypted destination.");
  const nonce = Buffer.from(iv, "base64url");
  const authTag = Buffer.from(tag, "base64url");
  if (nonce.length !== 12 || authTag.length !== 16) throw new Error("Invalid encrypted destination.");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
export function customerDestinationFingerprint(destination: string): string {
  return createHash("sha256").update(destination.trim().toLowerCase()).digest("hex");
}
