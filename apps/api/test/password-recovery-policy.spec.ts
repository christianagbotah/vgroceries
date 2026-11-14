import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PasswordRecoveryService,
  requestPasswordResetSchema,
  completePasswordResetSchema,
} from "../src/identity/password-recovery.service";
import { ApiProblem } from "../src/http/errors";
import { randomToken, tokenHash } from "../src/identity/crypto";

test("password recovery accepts registered email only and normalizes its case", () => {
  const parsed = requestPasswordResetSchema.safeParse({ email: "  CUSTOMER@Example.COM  " });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.email, "customer@example.com");
  for (const invalid of [
    { phone: "0241234567" },
    { email: "not-an-email" },
    { email: "valid@example.com", actor: "admin" },
    { email: "" },
  ]) assert.equal(requestPasswordResetSchema.safeParse(invalid).success, false);
});

test("new password requires 12 to 256 characters and a 256-bit raw reset code", () => {
  const token = randomToken();
  assert.equal(token.length, 64);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, tokenHash(token));
  assert.equal(completePasswordResetSchema.safeParse({ token, password: "LongAndUnique12345!" }).success, true);
  for (const input of [
    { token, password: "short" },
    { token, password: "x".repeat(257) },
    { token: "abc", password: "LongAndUnique12345!" },
    { token, password: "LongAndUnique12345!", actor: "someone-else" },
  ]) assert.equal(completePasswordResetSchema.safeParse(input).success, false);
});

test("recovery request refuses untrusted or missing browser origins before database access", async () => {
  const service = new PasswordRecoveryService({} as never, {
    webOrigins: ["https://portal.varietygroceries.com"],
  } as never);
  const unauthorised = (origin: string | undefined) => ({
    get: (name: string) => name === "origin" ? origin : undefined,
    requestId: "test", ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" },
  }) as never;
  for (const origin of [undefined, "https://untrusted.example", "http://portal.varietygroceries.com"]) {
    await assert.rejects(service.requestReset("user@example.com", unauthorised(origin)),
      (reason: unknown) => reason instanceof ApiProblem && reason.getStatus() === 403);
    await assert.rejects(service.completeReset(randomToken(), "LongAndUnique12345!", unauthorised(origin)),
      (reason: unknown) => reason instanceof ApiProblem && reason.getStatus() === 403);
  }
});
