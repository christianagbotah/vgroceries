import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { API_CONFIG, ApiConfig } from "../config";
import { ApiProblem } from "../http/errors";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
@Injectable()
export class VerificationCodeService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  private key(version?: number) {
    const commerce = this.config.commerce;
    if (!commerce) throw new ApiProblem(503, "UNAVAILABLE", "Commerce is not configured.");
    const resolved = version ?? commerce.verificationActiveKeyVersion;
    const key = commerce.verificationKeys.get(resolved);
    if (!key) throw new ApiProblem(503, "UNAVAILABLE", "Order verification key is unavailable.");
    return { key, version: resolved };
  }
  codeFor(orderId: string, keyVersion?: number): string {
    const { key } = this.key(keyVersion);
    const bytes = createHmac("sha256", key).update("order-code-v1:" + orderId).digest();
    let value = BigInt("0x" + bytes.subarray(0, 7).toString("hex")) >> 6n;
    let out = "";
    for (let i = 0; i < 10; i++) {
      out = ALPHABET[Number(value & 31n)] + out;
      value >>= 5n;
    }
    return out;
  }
  digestFor(orderId: string, code: string, keyVersion: number): string {
    const { key } = this.key(keyVersion);
    const normalized = code.trim().toUpperCase();
    return createHmac("sha256", key)
      .update(`order-code-hash-v1:${orderId}:${normalized}`)
      .digest("hex");
  }
  verify(orderId: string, code: string, keyVersion: number, storedDigest: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(storedDigest)) return false;
    const digest = this.digestFor(orderId, code, keyVersion);
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(storedDigest, "hex"));
  }
}
