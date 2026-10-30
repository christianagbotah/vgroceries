import { test } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { EtranzactReturnController } from "../src/payments/etranzact-return.controller";

const config = {
  payments: { providerId: "etranzact" },
  etranzact: {
    customerReturnUrl: "https://portal.varietygroceries.com/checkout/status/{orderId}",
  },
} as never;

test("eTranzact return hands signed form truth to payment authority then redirects to the owned order status", async () => {
  const calls: unknown[][] = [];
  const events = {
    handle: async (...args: unknown[]) => {
      calls.push(args);
      return { accepted: true, duplicate: false };
    },
  };
  const db = {
    paymentAttempt: {
      findUnique: async ({ where }: { where: { merchantReference: string } }) => {
        assert.equal(where.merchantReference, "VG-PAY-ABC123");
        return { orderId: "order-123" };
      },
    },
  };
  const redirects: Array<[number, string]> = [];
  const res = {
    redirect: (status: number, url: string) => {
      redirects.push([status, url]);
      return res;
    },
  } as unknown as Response;
  const body = Buffer.from("TRANSACTION_ID=VG-PAY-ABC123&SUCCESS=0");
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const req = {
    body,
    headers,
    requestId: "request-1",
  } as never;

  const controller = new EtranzactReturnController(config, events as never, db as never);
  await controller.receive(req, res);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["etranzact", body, headers, "request-1"]);
  assert.deepEqual(redirects, [[303, "https://portal.varietygroceries.com/checkout/status/order-123"]]);
});

test("eTranzact return rejects bodies without a bounded merchant transaction id before redirect", async () => {
  const controller = new EtranzactReturnController(
    config,
    { handle: async () => ({ accepted: true, duplicate: false }) } as never,
    { paymentAttempt: { findUnique: async () => ({ orderId: "order-123" }) } } as never,
  );
  const res = { redirect: () => assert.fail("must not redirect malformed callback") } as unknown as Response;
  await assert.rejects(
    () => controller.receive({ body: Buffer.from("SUCCESS=0"), headers: {}, requestId: "request-2" } as never, res),
    /transaction reference|invalid/i,
  );
});
