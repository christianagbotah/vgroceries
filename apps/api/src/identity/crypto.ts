import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const randomToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const csrfTokenFor = (token: string) => tokenHash(token + ":csrf-v1");
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, cost, (error, value) =>
      error ? reject(error) : resolve(value),
    ),
  );
}
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error("Passwords must have 12 to 256 characters");
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const parts = hash.split("$");
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join("$") !== "scrypt$32768$8$1" ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5])
  )
    return false;
  return timingSafeEqual(
    await derive(password, parts[4]),
    Buffer.from(parts[5], "hex"),
  );
}
export function sameSecretHash(secret: string, digest: string) {
  return (
    /^[a-f0-9]{64}$/.test(digest) &&
    timingSafeEqual(
      Buffer.from(tokenHash(secret), "hex"),
      Buffer.from(digest, "hex"),
    )
  );
}
