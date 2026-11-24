import { createCipheriv, randomBytes } from "node:crypto";
/** Separate deployment-managed key; the database never holds this key.
 * Bind ciphertext to the provider record and revision to prevent swapping.
 * Drafts are write-only and cannot affect payment or SMS runtime selection.
 */
export function encryptCredentialDraft(id: string, version: number, value: unknown, keyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("Credential vault not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex,"hex"), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(["integration-draft-v1",id,version])));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
