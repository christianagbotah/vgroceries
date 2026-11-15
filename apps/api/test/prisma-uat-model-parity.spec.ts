import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sessionActorSchema } from "@variety/contracts";

// The history files are already applied in UAT. A model deletion must not
// silently create destructive Prisma drift in the next generated migration.
const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = (name: string) =>
  readFileSync(join(prismaRoot, "migrations", name, "migration.sql"), "utf8");
const model = (name: string) => {
  const block = schema.match(new RegExp("^model " + name + " \\{[\\s\\S]*?^\\}", "m"));
  assert.ok(block, "Missing UAT-applied Prisma model " + name);
  return block[0];
};

test("already-applied UAT tables remain declared in Prisma", () => {
  const sources: Record<string, string> = {
    StaffInvitation: "202611120041_staff_cashier_invitations",
    CustomerSupportCase: "202611130001_customer_support_cases",
    CustomerSupportActivity: "202611130001_customer_support_cases",
    StockAdjustment: "202611140001_inventory_adjustment_approval",
    PasswordResetToken: "202611140002_self_service_password_recovery",
  };
  for (const [table, folder] of Object.entries(sources)) {
    model(table);
    assert.ok(
      migration(folder).includes('CREATE TABLE "' + table + '"'),
      "Historical migration for " + table + " has disappeared",
    );
  }
});

test("cashier role and POS sale identity reflect applied UAT migrations", () => {
  assert.match(schema, /^enum Role \{[\s\S]*?^  cashier$/m);
  const sale = model("PosCashSale");
  for (const field of ["customerMode", "customerUserId", "customerName", "customerPhone"]) {
    assert.match(sale, new RegExp("^  " + field + " ", "m"));
    assert.ok(migration("202611140003_pos_customer_identity").includes('"' + field + '"'));
  }
  assert.match(model("User"), /posCustomerSales PosCashSale\[\]/);
  assert.ok(
    migration("202611100040_pos_cashier_scoped_cash_sales")
      .includes("pos_cashier_allowed_at_location"),
  );
});

test("existing pickup attendance authority survives schema reconciliation", () => {
  const evidence = model("PickupAttendanceRecord");
  for (const field of ["orderId", "nodeId", "appointmentBookedAt", "observedAt", "recordedById"]) {
    assert.match(evidence, new RegExp("^  " + field + " ", "m"));
  }
  for (const owner of ["User", "Order", "LogisticsNode"]) {
    assert.match(model(owner), /pickupAttendanceRecords PickupAttendanceRecord\[\]/);
  }
  assert.ok(
    migration("202611150041_pickup_attendance_audit")
      .includes('CREATE TABLE "PickupAttendanceRecord"'),
  );
});

test("cashier identity is supported by shared contracts without granting access", () => {
  const actor = sessionActorSchema.parse({ id: "demo-id", name: "Demo Cashier", role: "cashier", locationIds: [] });
  assert.equal(actor.role, "cashier");
});

test("checked-in OpenAPI session actor matches the cashier contract", () => {
  const documented = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "docs", "openapi-foundation.json"), "utf8"));
  const roles = documented.components.schemas.SessionActor.properties.role.enum;
  assert.deepEqual(roles, ["admin", "inventory_manager", "cashier", "customer", "rider"]);
});
