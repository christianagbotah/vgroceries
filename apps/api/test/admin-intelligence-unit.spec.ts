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


test("admin Ghana catalogue coverage reports authoritative state counts without fabricating products", async () => {
  const db = {};
  const catalog = {
    async publishedForAnalysis() {
      return [
        catalogProduct("coverage-rice", "Perfumed Local Rice", ["rice", "staple"]),
        {
          ...catalogProduct("coverage-beans", "Black-eyed Beans", ["beans", "staple"]),
          anyAvailable: false,
          variants: [{
            ...catalogProduct("coverage-beans-vbase", "Black-eyed Beans", ["beans"]).variants[0],
            id: "coverage-beans-v",
            availableToSell: "0",
            isAvailable: false,
          }],
        },
        catalogProduct("coverage-chips", "Plantain Chips", ["plantain", "snack"]),
      ];
    },
  };
  const Service = AdminIntelligenceService as unknown as new (...args: unknown[]) => AdminIntelligenceService;
  const service = new Service(db, { stockLocationId: "loc_accra" }, catalog);
  const method = (service as unknown as { ghanaCatalogueCoverage?: () => Promise<{
    rows: Array<{ conceptId: string; status: string; matchingProducts: unknown[]; wrongFormProducts: unknown[] }>;
    summary: { total: number; available: number; outOfStock: number; wrongFormOnly: number; missing: number };
  }> }).ghanaCatalogueCoverage;

  assert.equal(typeof method, "function", "admin coverage service method should exist");
  const result = await method!.call(service);
  const byId = new Map(result.rows.map((row) => [row.conceptId, row]));
  assert.equal(byId.get("rice")?.status, "available");
  assert.equal(byId.get("beans")?.status, "out_of_stock");
  assert.equal(byId.get("plantain")?.status, "wrong_form_only");
  assert.equal(byId.get("yam")?.status, "missing");
  assert.equal(result.summary.total, result.rows.length);
  assert.equal(result.summary.available + result.summary.outOfStock + result.summary.wrongFormOnly + result.summary.missing, result.summary.total);
  assert.ok(result.summary.missing > 0);
});
