import { strict as assert } from "node:assert";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { CustomerOtpRepository, OtpIssueRateLimited } from "../src/notifications/customer-otp-repository";
import { digestCustomerOtp } from "../src/notifications/customer-otp-policy";

const secret = randomBytes(32).toString("hex");
const encryption = randomBytes(32).toString("hex");
const userId = randomUUID();
const phone = "233241234567";
const now = new Date("2026-11-21T12:00:00Z");

test("OTP issuance persists encrypted destination, digest, expiry and account binding", async () => {
  let stored: any;
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => {
      assert.match(sql.join("?"), /SELECT 1::int AS locked FROM pg_advisory_xact_lock/);
      return [{ locked: 1 }];
    },
    customerOtpChallenge: {
      findMany: async () => [],
      create: async ({ data }: any) => { stored = data; return data; },
    },
  };
  const db = { $transaction: async (callback: any) => callback(tx) };
  const repo = new CustomerOtpRepository(db as any, secret, encryption);
  const issued = await repo.issue(userId, phone, "phone_verification", now);
  assert.match(issued.code, /^\d{6}$/);
  assert.equal(stored.userId, userId);
  assert.equal(stored.codeDigest, digestCustomerOtp(secret, issued.id, issued.code));
  assert.equal(stored.expiresAt.getTime() - now.getTime(), 300000);
  assert.ok(!stored.recipientEncrypted.includes(phone));
  assert.ok(!JSON.stringify(stored).includes(issued.code));
});

test("OTP issuance enforces cooldown and hourly limit", async () => {
  let recent = [{ createdAt: new Date(now.getTime() - 1000) }];
  const tx = {
    $queryRaw: async () => [{ locked: 1 }],
    customerOtpChallenge: { findMany: async () => recent, create: async () => { throw new Error("must not create"); } },
  };
  const db = { $transaction: async (callback: any) => callback(tx) };
  const repo = new CustomerOtpRepository(db as any, secret, encryption);
  await assert.rejects(repo.issue(userId, phone, "phone_verification", now), (err:unknown) => {
    assert.ok(err instanceof OtpIssueRateLimited);
    assert.equal(err.retryAfterSeconds, 59);
    return true;
  });
  recent = Array.from({ length: 5 }, () => ({ createdAt: new Date(now.getTime() - 120000) }));
  await assert.rejects(repo.issue(userId, phone, "phone_verification", now), (err:unknown) => {
    assert.ok(err instanceof OtpIssueRateLimited);
    assert.equal(err.retryAfterSeconds, 3480);
    return true;
  });
});

test("successful verification atomically consumes code and marks same account phone verified", async () => {
  const id = randomUUID();
  const code = "123456";
  let consumption = 0;
  let verified = 0;
  const tx = {
    customerOtpChallenge: {
      findFirst: async () => ({ id }),
      updateMany: async ({ where }: any) => {
        assert.equal(where.codeDigest, digestCustomerOtp(secret, id, code));
        consumption++;
        return { count: 1 };
      },
    },
    user: { updateMany: async ({ where }: any) => {
      assert.equal(where.id, userId);
      assert.equal(where.phone, phone);
      verified++;
      return { count: 1 };
    } },
  };
  const db = { $transaction: async (callback: any) => callback(tx) };
  const repo = new CustomerOtpRepository(db as any, secret, encryption);
  assert.equal(await repo.verifyPhone(userId, phone, id, code, now), true);
  assert.equal(consumption, 1);
  assert.equal(verified, 1);
});

test("wrong OTP increments attempt without verifying phone", async () => {
  const id = randomUUID();
  let failures = 0;
  const tx = {
    customerOtpChallenge: {
      findFirst: async () => ({ id }),
      updateMany: async ({ where }: any) => {
        if ("codeDigest" in where) return { count: 0 };
        failures++;
        return { count: 1 };
      },
    },
    user: { updateMany: async () => { throw new Error("must not verify"); } },
  };
  const db = { $transaction: async (callback: any) => callback(tx) };
  const repo = new CustomerOtpRepository(db as any, secret, encryption);
  assert.equal(await repo.verifyPhone(userId, phone, id, "000000", now), false);
  assert.equal(failures, 1);
});
