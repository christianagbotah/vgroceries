import { describe, expect, test } from "bun:test";
import { restEndpoints } from "./contracts/endpoints";
import { operationMeta } from "./operation-registry";

describe("customer pickup choice service contract", () => {
  test("maps the public pickup-options read through the normal service boundary", () => {
    expect(restEndpoints["checkout.pickup-options"]).toEqual({ method: "GET", path: "/checkout/pickup-options" });
    expect(operationMeta["checkout.pickup-options"]?.tags).toContain("config");
    expect(operationMeta["checkout.pickup-options"]?.tags).toContain("logistics");
  });
});
