import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyInventoryLot } from "../src/inventory/expiry-classification";
import { InventoryService } from "../src/inventory/inventory.service";
import { ApiProblem } from "../src/http/errors";

const today = "2026-11-13";
const regular = (expiryDate: string | null) =>
  classifyInventoryLot({ kind: "regular", quarantined: false, expiryDate }, today);

test("expiry classification uses calendar days without incorrectly marking today's food expired", () => {
  assert.deepEqual(regular("2026-11-12"), { queue: "expired" });
  assert.deepEqual(regular("2026-11-13"), { queue: "soon", daysLeft: 0 });
  assert.deepEqual(regular("2026-11-20"), { queue: "soon", daysLeft: 7 });
  assert.equal(regular("2026-11-21"), null);
  assert.equal(regular(null), null);
});
test("damaged and quarantined goods are not erroneously promoted as expiring stock", () => {
  assert.deepEqual(classifyInventoryLot({
    kind: "damaged", quarantined: true, expiryDate: "2026-11-12",
  }, today), { queue: "damaged" });
  assert.deepEqual(classifyInventoryLot({
    kind: "regular", quarantined: true, expiryDate: "2026-11-12",
  }, today), { queue: "quarantined" });
  assert.deepEqual(classifyInventoryLot({
    kind: "return_quarantine", quarantined: false, expiryDate: "2026-11-21",
  }, today), { queue: "quarantined" });
});
test("expiry uses zero-stock suppression, branch authorization and original stock data", async () => {
  let requestedLocation = "";
  const db = {
    location: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        ({ id: where.id, name: "Accra Main", active: true }),
    },
    stockLot: {
      findMany: async (args: { where: { quantity: { gt: number }; position: { locationId: string } } }) => {
        assert.equal(args.where.quantity.gt, 0);
        requestedLocation = args.where.position.locationId;
        return [
          {
            id: "lot", lotNumber: "B202611", kind: "regular", quarantined: false,
            quantity: { toString: () => "4.000" },
            expiryDate: new Date("2026-11-12T00:00:00Z"),
            position: {
              variantId: "variant", variant: { name: "Tin",
                product: { name: "Milk" } },
            },
          },
        ];
      },
    },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  const actor = { actor: { role: "inventory_manager", locationIds: ["loc_accra"] } } as never;
  const result = await service.expiry(actor);
  assert.equal(requestedLocation, "loc_accra");
  assert.equal(result.expired.length + result.soon.length, 1);
  assert.equal(result.expired[0]?.productName ?? result.soon[0]?.productName, "Milk");
  assert.equal(result.quarantined.length, 0);
  assert.equal(result.damaged.length, 0);
  await assert.rejects(
    service.expiry(actor, "other-location"),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 403,
  );
  assert.equal(requestedLocation, "loc_accra");
});
test("expiry report refuses to silently truncate large datasets", async () => {
  const db = {
    location: { findUnique: async () => ({ active: true, name: "Accra" }) },
    stockLot: { findMany: async () => new Array(2001).fill({}) },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  await assert.rejects(service.expiry({ actor: { role: "admin" } } as never),
    (err: unknown) => err instanceof ApiProblem && err.getStatus() === 409);
});
