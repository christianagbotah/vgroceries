import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogProduct } from "@variety/contracts";
import { AdminIntelligenceService } from "../src/admin-intelligence/admin-intelligence.service";

function catalogProduct(id: string, name: string, tags: string[]): CatalogProduct {
  return {
    id, slug: id, name, categoryId: "food", categoryName: "Food", shortDescription: "", description: "", tags,
    image: "", gallery: [], anyAvailable: true, minPriceMinor: 100, minPriceLabel: "₵1.00",
    variants: [{ id: `${id}-v`, name: "Standard", unit: "piece", unitSize: "1 piece", priceMinor: 100, priceLabel: "₵1.00", availableToSell: "10", isAvailable: true }],
  };
}

test("admin AI suggestions surface Ghana meal catalogue gaps from currently purchasable products", async () => {
  const db = {
    $queryRaw: async () => [],
    stockLot: { findMany: async () => [] },
    paymentAttempt: { findMany: async () => [] },
    order: { findMany: async () => [] },
    auditEvent: { findMany: async () => [] },
  };
  const catalog = {
    async list(input: { page: number }) {
      const items = input.page === 1 ? [
        catalogProduct("rice", "Perfumed Local Rice", ["rice", "staple"]),
        catalogProduct("chips", "Plantain Chips", ["plantain", "snack"]),
      ] : [];
      return { items, total: items.length, page: input.page, perPage: 100, pages: 1 };
    },
  };
  const Service = AdminIntelligenceService as unknown as new (...args: unknown[]) => AdminIntelligenceService;
  const service = new Service(db, { stockLocationId: "loc_accra" }, catalog);
  const rows = await service.suggestions();

  const yam = rows.find((row) => /Yam/.test(row.title) && /catalogue/i.test(row.title));
  assert.ok(yam, "missing yam must be visible as a Ghana meal catalogue gap");
  assert.equal(yam.kind, "operations_explanation");
  assert.match(yam.proposedAction ?? "", /source|catalogue|product/i);
  assert.ok(yam.evidence.some((line) => /ampesi/i.test(line)));
  assert.equal(rows.some((row) => /Rice/.test(row.title) && /catalogue/i.test(row.title)), false);
  assert.ok(rows.some((row) => /Plantain/.test(row.title) && /catalogue/i.test(row.title)), "plantain chips must not satisfy raw plantain coverage");
});
