import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { restEndpoints } from "../packages/contracts/src/endpoints";

const read = (path: string) => readFileSync(path, "utf8");

/** A guarded backport onto the exact POS-integrated Hubtel staging lineage.
 *  The full upstream checkout preflight already exists in main; this keeps
 *  staging from silently presenting a payment choice its backend rejects.
 */
describe("POS-integrated hosted checkout readiness parity", () => {
  test("public GET contract matches exact, no-cache production controller", () => {
    expect(restEndpoints["checkout.payment-availability"]).toEqual({
      method: "GET", path: "/checkout/payment-availability",
    });
    const source = read("apps/api/src/orders/checkout.controller.ts");
    expect(source).toContain('@Get("payment-availability") @Header("Cache-Control","no-store")');
    expect(source).toContain("this.payments.assertReadyIfConfigured()");
    expect(source).toContain("this.payments.resolveElectronicMethod()");
    expect(source).toContain('electronicAvailable:false,mode:"production"');
    expect(source).not.toContain("HUBTEL_CLIENT_SECRET");
    expect(read("apps/api/src/payments/payment-policy.service.ts"))
      .toContain("this.refundRegistry.require(adapter.id, method)");
  });

  test("customer cannot create an electronic order while status is unknown or unavailable", () => {
    const ui = read("src/app/(storefront)/checkout/page.tsx");
    expect(ui).toContain('useState<"checking" | "available" | "unavailable">("checking")');
    expect(ui).toContain("apiOps.checkoutPaymentAvailability()");
    expect(ui).toContain('paymentMethod === "electronic" && electronicAvailability !== "available"');
    expect(ui).toContain("No money has been requested");
    expect(ui).toContain("Check again");
    expect(ui).toContain('disabled={electronicAvailability !== "available"}');
  });

  test("browser operation is an uncached hint and mock is distinctly demo", () => {
    const client = read("src/services/client.ts");
    const mock = read("src/services/mock/router.ts");
    const operations = read("src/services/operation-registry.ts");
    expect(client).toContain('"checkout.payment-availability"');
    expect(mock).toContain('case "checkout.payment-availability":');
    expect(mock).toContain('electronicAvailable:true,mode:"demo"');
    expect(operations).toContain('"checkout.payment-availability": {}');
  });

  test("read-only endpoint appears with public security in production OpenAPI", () => {
    const schema = read("apps/api/src/http/production-openapi.ts");
    const foundation = read("apps/api/src/http/openapi.ts");
    expect(schema).toContain('doc.paths["/api/v1/checkout/payment-availability"]');
    expect(schema).toContain('security: []');
    expect(foundation).toContain("documentedCheckoutAvailability");
  });
});
