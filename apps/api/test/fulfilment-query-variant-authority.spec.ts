import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { PaymentCaptureService } from "../src/payments/payment-capture.service";
import { FulfilmentPolicyService } from "../src/fulfilment/fulfilment-policy.service";
import { FulfilmentQueryService } from "../src/fulfilment/fulfilment-query.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let query: FulfilmentQueryService;

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Fulfilment query variant tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  query = new FulfilmentQueryService(
    db,
    new FulfilmentPolicyService(),
    app.get(PaymentCaptureService),
  );
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => {
  await app?.close();
});

test("query authority blocks actions when reservation stock-position variant differs from the order line", async () => {
  const orderId = "query-variant-mismatch";
  const lineId = `${orderId}-line-rice`;
  await db.order.create({
    data: {
      id: orderId,
      reference: "VG-QUERY-VARIANT-MISMATCH",
      customerUserId: "customer-a",
      customerName: "Variant Mismatch Customer",
      customerPhone: "+233241111111",
      fulfilment: "delivery",
      paymentMethod: "mobile_money",
      paymentStatus: "succeeded",
      fulfilmentStatus: "awaiting_confirmation",
      deliveryStatus: "unassigned",
      subtotalMinor: 1000,
      totalMinor: 1000,
      verificationKeyVersion: 1,
      verificationCodeHash: "d".repeat(64),
      lines: {
        create: {
          id: lineId,
          variantId: "var-rice",
          productId: "product-rice",
          productName: "Fixture Rice",
          variantName: "Weighted rice",
          unit: "kg",
          quantity: "2",
          unitPriceMinor: 500,
          lineTotalMinor: 1000,
        },
      },
    },
  });

  // Deliberately corrupt the reservation provenance: the claim line is for rice,
  // but its stock position and lot belong to salt. Read projections must fail
  // closed exactly as command-side ClaimCoverageService does.
  await db.reservation.create({
    data: {
      id: `${orderId}-reservation-wrong-variant`,
      positionId: "pos-salt",
      lotId: "lot-salt",
      claimType: "order",
      claimId: orderId,
      claimLineId: lineId,
      generation: 1,
      quantity: "2",
      state: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const result = await query.list({
    page: 1,
    perPage: 25,
    status: "awaiting_confirmation",
  });
  assert.equal(result.total, 1);
  const row = result.items[0]!;
  assert.ok(row.blockingReasons.includes("reservation_lost"));
  assert.deepEqual(row.allowedActions, []);
});
