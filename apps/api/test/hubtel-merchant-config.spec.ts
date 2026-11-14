import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/config";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/variety",
  API_STOCK_LOCATION_ID: "loc_accra",
  WEB_ORIGINS: "https://portal.varietygroceries.com",
  NODE_ENV: "production",
};

const sales = {
  HUBTEL_SALES_API_ID: "sales-id-placeholder",
  HUBTEL_SALES_API_KEY: "sales-key-placeholder",
  HUBTEL_COLLECTION_ACCOUNT_NUMBER: "12345",
};
const sms = {
  HUBTEL_SMS_CLIENT_ID: "sms-id-placeholder",
  HUBTEL_SMS_CLIENT_SECRET: "sms-secret-placeholder",
  HUBTEL_SMS_SENDER_ID: "VARIETY",
};

test("Merchant credentials are optional and do not automatically activate payments or SMS", () => {
  const missing = readConfig(base);
  assert.equal(missing.hubtelSales, null);
  assert.equal(missing.hubtelSms, null);
  assert.equal(missing.payments, null);

  const parsed = readConfig({ ...base, ...sales, ...sms });
  assert.deepEqual(parsed.hubtelSales, {
    apiId: sales.HUBTEL_SALES_API_ID,
    apiKey: sales.HUBTEL_SALES_API_KEY,
    collectionAccount: sales.HUBTEL_COLLECTION_ACCOUNT_NUMBER,
  });
  assert.deepEqual(parsed.hubtelSms, {
    clientId: sms.HUBTEL_SMS_CLIENT_ID,
    clientSecret: sms.HUBTEL_SMS_CLIENT_SECRET,
    senderId: sms.HUBTEL_SMS_SENDER_ID,
  });
  assert.equal(parsed.hubtelPayment, null);
  assert.equal(parsed.payments, null);
});

test("Sales configuration rejects a partial bundle without disclosing secrets", () => {
  assert.throws(
    () => readConfig({ ...base, HUBTEL_SALES_API_ID: "sensitive-value" }),
    /Hubtel Sales configuration must be supplied as a complete bundle/,
  );
  assert.throws(
    () => readConfig({ ...base, ...sales, HUBTEL_COLLECTION_ACCOUNT_NUMBER: "not-a-number" }),
    /HUBTEL_COLLECTION_ACCOUNT_NUMBER/,
  );
  assert.throws(
    () => readConfig({ ...base, ...sales, HUBTEL_SALES_API_KEY: "" }),
    /Hubtel Sales API credentials/,
  );
});

test("SMS configuration requires complete credentials and an approved-length sender ID", () => {
  assert.throws(
    () => readConfig({ ...base, HUBTEL_SMS_CLIENT_ID: "sensitive-value" }),
    /Hubtel SMS configuration must be supplied as a complete bundle/,
  );
  assert.throws(
    () => readConfig({ ...base, ...sms, HUBTEL_SMS_SENDER_ID: "TOO-LONG-SENDER-123" }),
    /HUBTEL_SMS_SENDER_ID/,
  );
  assert.throws(
    () => readConfig({ ...base, ...sms, HUBTEL_SMS_CLIENT_SECRET: " " }),
    /Hubtel SMS credentials/,
  );
});
