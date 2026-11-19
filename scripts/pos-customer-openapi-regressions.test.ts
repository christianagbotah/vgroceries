import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const openapi = () => JSON.parse(readFileSync(join(root, "docs/openapi-foundation.json"), "utf8"));

describe("registered POS customer selector production contract", () => {
  test("published route is authenticated GET only with bounded q and no mutations", () => {
    const doc = openapi();
    expect(Object.keys(doc.paths)).toHaveLength(159);
    const route = doc.paths["/api/v1/admin/pos/customers"];
    expect(route).toBeDefined();
    expect(Object.keys(route)).toEqual(["get"]);
    const op = route.get;
    expect(op.security).toEqual([{ cookieAuth: [] }, { bearerAuth: [] }]);
    expect(op.parameters).toEqual([
      { name: "q", in: "query", required: true,
        schema: { type: "string", minLength: 2, maxLength: 80 } },
    ]);
    expect(op.responses["200"].content["application/json"].schema)
      .toEqual({ $ref: "#/components/schemas/PosCustomerSearchResultEnvelope" });
  });

  test("result contains masked phone only, no sensitive customer fields", () => {
    const doc = openapi();
    const schema = doc.components.schemas.PosCustomerSearchResult;
    expect(schema.type).toBe("array");
    expect(schema.maxItems).toBe(15);
    const item = schema.items;
    expect(item.additionalProperties).toBe(false);
    expect(Object.keys(item.properties).sort()).toEqual(["id", "name", "phoneLast4"]);
    expect(item.properties.phoneLast4.pattern).toBe("^\\d{0,4}$");
    const combined = JSON.stringify({
      route: doc.paths["/api/v1/admin/pos/customers"],
      result: schema,
    });
    for (const forbidden of ["passwordHash", "customerPhone", "customerEmail", "refundId",
      "customerUser.passwordHash", "stockDepletionId"]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});
