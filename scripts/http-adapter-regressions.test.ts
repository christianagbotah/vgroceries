/// <reference types="bun-types" />
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { MockServiceAdapter } from "../src/services/adapters/mock";
import { ApiError } from "../src/services/adapters/types";
import { getStore, resetStore } from "../src/services/mock/store";

interface WireCall { path: string; method: string; query: URLSearchParams; key: string | null; contentType: string | null; body: unknown }
const calls: WireCall[] = [];
let reply: (req: Request) => Response = () => Response.json({ ok: true, data: { received: true } });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  const url = new URL(req.url);
  const contentType = req.headers.get("content-type");
  let body: unknown = undefined;
  if (req.method === "POST") {
    if (contentType?.startsWith("multipart/form-data")) {
      const form = await req.formData();
      body = Object.fromEntries([...form.entries()].map(([key, value]) => {
        const item = value as unknown;
        if (typeof item === "object" && item !== null && "name" in item && "type" in item && "size" in item) {
          const file = item as { name: unknown; type: unknown; size: unknown };
          return [key, { name: String(file.name), type: String(file.type), size: Number(file.size) }];
        }
        return [key, value];
      }));
    } else body = await req.json();
  }
  calls.push({ path: url.pathname, method: req.method, query: url.searchParams,
    key: req.headers.get("Idempotency-Key"), contentType, body });
  return reply(req);
} });
const base = `http://127.0.0.1:${server.port}`;
beforeEach(() => { calls.length = 0; resetStore(); reply = () => Response.json({ ok: true, data: { received: true } }); });
afterAll(() => server.stop(true));
const checkout = {
  lines: [{ variantId: "var_tof_1", quantity: "1" }], customerName: "Wire Test",
  customerPhone: "+233200000001", fulfilment: "collection", paymentMethod: "cash_counter",
  idempotencyKey: "wire-test-1",
};

describe("production HTTP contract", () => {
  test("all documented operations send the OpenAPI method and REST path", async () => {
    const doc = readFileSync("docs/API_CONTRACTS.md", "utf8");
    const mappings = [...doc.matchAll(/\| `([a-z][a-z0-9._-]+)` \| `(GET|POST) (\/[^`]+)` \|/g)];
    const { load } = createRequire(import.meta.url)("js-yaml") as {
      load: (source: string) => { paths: Record<string, Record<string, unknown>> };
    };
    const spec = load(readFileSync("docs/openapi.yaml", "utf8"));
    const ids = { slug: "farm-eggs", orderId: "ord_1014", zoneId: "zone_accra", returnId: "ret_2002",
      productId: "prd_001", customerId: "cus_002", jobId: "job_5001", draftId: "draft_001",
      receiptNo: "R-00004", sessionId: "cash_02", lotId: "lot_001", riderId: "rid_2", refundId: "ref_3001" };
    const http = new HttpServiceAdapter(`${base}/api/v1`);
    expect(mappings.length).toBe(92);
    for (const [, op, method, path] of mappings) {
      expect(spec.paths[path]?.[method.toLowerCase()]).toBeDefined();
      await http.request({ op, query: ids, body: method === "POST" ? ids : undefined, skipValidation: true });
      const expected = path.replace(/\{([^}]+)\}/g, (_, key: keyof typeof ids) => ids[key]);
      expect(calls.at(-1)?.path).toBe(`/api/v1${expected}`);
      expect(calls.at(-1)?.method).toBe(method);
    }
  });
  test("REST path values are encoded and removed from the query", async () => {
    await new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.product", query: { slug: "spices & oil/500g" } });
    expect(calls[0].path).toBe("/api/v1/catalog/products/spices%20%26%20oil%2F500g");
    expect(calls[0].query.has("slug")).toBe(false);
  });
  test("catalogue search translates the screen's query field to REST q", async () => {
    await new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.list", query: { query: "Milo & sugar", page: 2 } });
    expect(calls[0].query.get("q")).toBe("Milo & sugar");
    expect(calls[0].query.has("query")).toBe(false);
    expect(calls[0].query.get("page")).toBe("2");
  });
  test("a missing REST resource id is rejected before sending", async () => {
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "admin.order" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(calls).toHaveLength(0);
  });
  test("explicit mock transport preserves the existing operation URLs", async () => {
    await new HttpServiceAdapter(`${base}/api/mock/v1`, { protocol: "mock" }).request({ op: "catalog.product", query: { slug: "farm-eggs" } });
    expect(calls[0].path).toBe("/api/mock/v1/catalog/product");
    expect(calls[0].query.get("slug")).toBe("farm-eggs");
  });
  test("checkout body keys become the REST idempotency header", async () => {
    await new HttpServiceAdapter(`${base}/api/v1`).request({ op: "checkout.complete", body: checkout });
    expect(calls[0].key).toBe("wire-test-1");
  });
  test("header-style checkout keys also satisfy shared validation", async () => {
    const { idempotencyKey, ...body } = checkout;
    await new HttpServiceAdapter(`${base}/api/v1`).request({ op: "checkout.complete", body, idempotencyKey });
    expect(calls[0].key).toBe(idempotencyKey);
    expect(calls[0].body).toMatchObject({ idempotencyKey });
  });
  test("conflicting header and body keys are rejected before sending", async () => {
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "checkout.complete", body: checkout,
      idempotencyKey: "different-key" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(calls).toHaveLength(0);
  });

  test("multipart product media upload preserves path params and lets fetch own the boundary", async () => {
    const formData = new FormData();
    formData.set("altText", "Fresh tomatoes on a clean background");
    formData.set("file", new File([new Uint8Array([1, 2, 3, 4])], "tomatoes.png", { type: "image/png" }));
    await new HttpServiceAdapter(`${base}/api/v1`).request({
      op: "admin.product-media.upload", query: { productId: "prd media/001" }, formData,
    } as any);
    expect(calls[0].path).toBe("/api/v1/admin/catalog/products/prd%20media%2F001/media/uploads");
    expect(calls[0].contentType).toStartWith("multipart/form-data; boundary=");
    expect(calls[0].contentType).not.toContain("application/json");
    expect(calls[0].body).toMatchObject({ altText: "Fresh tomatoes on a clean background", file: { name: "tomatoes.png", type: "image/png", size: 4 } });
  });
  test("multipart generation-safe transport preserves idempotency headers", async () => {
    const formData = new FormData(); formData.set("file", new File(["x"], "x.png", { type: "image/png" }));
    await new HttpServiceAdapter(`${base}/api/v1`).request({ op: "admin.product-media.upload", query: { productId: "prd_001" }, formData, idempotencyKey: "media-upload-001" } as any);
    expect(calls[0].key).toBe("media-upload-001");
  });
  test("body and formData are mutually exclusive before any request is sent", async () => {
    const formData = new FormData(); formData.set("altText", "x");
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "admin.product-media.upload", query: { productId: "prd_001" }, body: { altText: "x" }, formData } as any))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(calls).toHaveLength(0);
  });

  test("logistics REST paths substitute ids and forward replay keys without inventing one for simulation", async () => {
    const http = new HttpServiceAdapter(`${base}/api/v1`);
    await http.request({ op: "admin.logistics.node.update", query: { nodeId: "node accra/1" }, body: { publicName: "Accra Central" }, idempotencyKey: "logistics-node-001", skipValidation: true });
    expect(calls.at(-1)?.path).toBe("/api/v1/admin/logistics/nodes/node%20accra%2F1");
    expect(calls.at(-1)?.method).toBe("POST");
    expect(calls.at(-1)?.key).toBe("logistics-node-001");
    expect(calls.at(-1)?.query.has("nodeId")).toBe(false);

    await http.request({ op: "admin.logistics.workflow.save", query: { templateId: "wf/1", versionId: "v 2" }, body: { expectedRevision: 1, stages: [] }, idempotencyKey: "logistics-wf-0001", skipValidation: true });
    expect(calls.at(-1)?.path).toBe("/api/v1/admin/logistics/workflows/wf%2F1/versions/v%202");
    expect(calls.at(-1)?.key).toBe("logistics-wf-0001");

    await http.request({ op: "admin.logistics.route-rule.simulate", body: { originNodeId: "node-1", fulfilment: "delivery", deliveryZoneId: "zone-1", destinationKind: "doorstep" }, skipValidation: true });
    expect(calls.at(-1)?.path).toBe("/api/v1/admin/logistics/route-rules/simulate");
    expect(calls.at(-1)?.method).toBe("POST");
    expect(calls.at(-1)?.key).toBeNull();
  });

  test("problem responses preserve machine-readable domain codes", async () => {
    reply = () => Response.json({ type: "about:blank", status: 409, code: "OUT_OF_STOCK", detail: "Last unit sold", details: { variantId: "var_tof_1" } }, { status: 409 });
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.list" })).rejects.toMatchObject({
      code: "OUT_OF_STOCK", message: "Last unit sold", details: { variantId: "var_tof_1" },
    });
  });
  test("plain authentication problems retain the canonical authentication code", async () => {
    reply = () => Response.json({ type: "about:blank", title: "Sign in required" }, { status: 401 });
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.list" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  test("bare REST errors preserve the documented code, message and details", async () => {
    reply = () => Response.json({ code: "RETURN_RECONCILIATION_REQUIRED", message: "Returned stock has moved", details: { lotId: "lot_return_1" } }, { status: 409 });
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.list" })).rejects.toMatchObject({
      code: "RETURN_RECONCILIATION_REQUIRED", message: "Returned stock has moved", details: { lotId: "lot_return_1" },
    });
  });
  test("null error responses are normalized to ApiError", async () => {
    reply = () => Response.json(null, { status: 500 });
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.list" })).rejects.toBeInstanceOf(ApiError);
  });
  test.each([{ ok: true }, { ok: "true", data: {} }, { ok: false }, null])("malformed successful payloads are rejected: %j", async (value) => {
    reply = () => Response.json(value);
    await expect(new HttpServiceAdapter(`${base}/api/v1`).request({ op: "catalog.list" })).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
  test("the timeout covers a stalled body after headers arrive", async () => {
    reply = (req) => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
      req.signal.addEventListener("abort", () => { try { controller.close(); } catch {} });
    } }), { headers: { "Content-Type": "application/json" } });
    const pending = new HttpServiceAdapter(`${base}/api/v1`, { timeoutMs: 50 }).request({ op: "catalog.list" });
    const outcome = await Promise.race([pending.then(() => "resolved", (error: ApiError) => error.code), Bun.sleep(250).then(() => "still-pending")]);
    expect(outcome).toBe("NETWORK");
    server.stop(true);
    await pending.catch(() => undefined);
  });
});

describe("customer return boundary", () => {
  test("the actual screen payload creates a return without a client-supplied actor", async () => {
    const store = getStore();
    const order = store.orders.find((entry) => entry.id === "ord_1014")!;
    const result = await new MockServiceAdapter().request<{ returnId: string }>({ op: "account.create-return", body: {
      orderId: order.id, lines: [{ orderLineId: order.lines[0], quantity: "1", reason: "Item returned" }], evidenceNote: "Customer evidence",
    } });
    const ret = store.returnRequests.find((entry) => entry.id === result.returnId)!;
    expect(ret.requestedBy).toBe("customer");
    expect(ret.evidenceNote).toBe("Customer evidence");
  });
});
