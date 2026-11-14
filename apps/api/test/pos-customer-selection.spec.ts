import { test } from "node:test";
import assert from "node:assert/strict";
import { posCashSaleCompleteSchema } from "@variety/contracts";
import { PosCustomersController } from "../src/cashier-tills/pos-customers.controller";
import { ApiProblem } from "../src/http/errors";

const base = {
  holdId: "11111111-1111-4111-8111-111111111111",
  cashReceivedMinor: 2000,
  cashCountConfirmed: true as const,
  goodsHandedOver: true as const,
  handoverNote: "Cash counted and all grocery goods handed over",
};

test("POS defaults to a walk-in sale when customer identity is omitted", () => {
  assert.equal(posCashSaleCompleteSchema.safeParse(base).success, true);
  assert.equal(posCashSaleCompleteSchema.safeParse({
    ...base, customerMode: "walk_in",
  }).success, true);
});

test("registered customer can be selected only using an explicit user id", () => {
  assert.equal(posCashSaleCompleteSchema.safeParse({
    ...base, customerMode: "existing", customerUserId: "customer-123",
  }).success, true);
  assert.equal(posCashSaleCompleteSchema.safeParse({
    ...base, customerMode: "existing",
  }).success, false);
  assert.equal(posCashSaleCompleteSchema.safeParse({
    ...base, customerMode: "walk_in", customerUserId: "customer-123",
  }).success, false);
});

test("named walk-ins need a name but never create or claim an account", () => {
  assert.equal(posCashSaleCompleteSchema.safeParse({
    ...base, customerMode: "named", customerName: "  Ama Mensah  ",
  }).success, true);
  for (const bad of [
    { customerMode: "named" },
    { customerMode: "named", customerName: " " },
    { customerMode: "named", customerName: "A".repeat(121) },
    { customerMode: "named", customerName: "Ama", customerUserId: "customer-123" },
    { customerMode: "walk_in", customerName: "An unlinked name" },
    { customerMode: "registered" },
    { customerMode: "named", customerName: "Ama", role: "admin" },
  ]) assert.equal(posCashSaleCompleteSchema.safeParse({ ...base, ...bad }).success, false);
});

test("customer lookup denies customer/rider logins and refuses short queries", async () => {
  let reads = 0;
  const db = { user: { findMany: async () => { reads++; return []; } } } as never;
  const controller = new PosCustomersController(db);
  for (const role of ["customer", "rider", "inventory"]) {
    await assert.rejects(
      controller.search({ actor: { role } } as never, "Ama"),
      (e: unknown) => e instanceof ApiProblem && e.getStatus() === 403,
    );
  }
  assert.equal(reads, 0);
  assert.deepEqual(await controller.search({ actor: { role: "cashier" } } as never, "A"), { ok: true, data: [] });
  assert.equal(reads, 0);
  await assert.rejects(
    controller.search({ actor: { role: "cashier" } } as never, "X".repeat(81)),
    (e: unknown) => e instanceof ApiProblem && e.getStatus() === 400,
  );
  assert.equal(reads, 0);
});

test("POS search includes only active registered customers, with a strict limit", async () => {
  let captured: Record<string, unknown> | undefined;
  const data = [{ id: "c1", name: "Ama Mensah", phone: "+233111111111", email: "a@example.test" }];
  const db = { user: {
    findMany: async (args: Record<string, unknown>) => { captured = args; return data; },
  } } as never;
  const controller = new PosCustomersController(db);
  assert.deepEqual(await controller.search({ actor: { role: "cashier" } } as never, "ama"), { ok: true, data });
  const where = captured?.where as Record<string, unknown>;
  assert.equal(where.role, "customer");
  assert.equal(where.active, true);
  assert.equal(captured?.take, 15);
  assert.equal((where.OR as unknown[]).length, 3);
});
