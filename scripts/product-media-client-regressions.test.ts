/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { restEndpoints } from "../packages/contracts/src/endpoints";
import { invalidatesTags, readTags } from "../src/services/operation-registry";
import { MockServiceAdapter } from "../src/services/adapters/mock";

const expected = {
  "admin.product.create": ["POST", "/admin/catalog/products"],
  "admin.product-media": ["GET", "/admin/catalog/products/{productId}/media"],
  "admin.product-media.upload": ["POST", "/admin/catalog/products/{productId}/media/uploads"],
  "admin.product-media.generate": ["POST", "/admin/catalog/products/{productId}/media/generations"],
  "admin.product-media.generation": ["GET", "/admin/catalog/media/generations/{jobId}"],
  "admin.product-media.approve": ["POST", "/admin/catalog/media/{mediaId}/approve"],
  "admin.product-media.reject": ["POST", "/admin/catalog/media/{mediaId}/reject"],
  "admin.product-media.archive": ["POST", "/admin/catalog/media/{mediaId}/archive"],
  "admin.product-media.featured": ["POST", "/admin/catalog/products/{productId}/media/featured"],
  "admin.product-media.reorder": ["POST", "/admin/catalog/products/{productId}/media/reorder"],
  "admin.product-media.brand-mode": ["POST", "/admin/catalog/products/{productId}/media/brand-mode"],
} as const;

describe("Product Media browser contract", () => {
  test("all Product Media operations map to the production authority", () => {
    for (const [op, [method, path]] of Object.entries(expected)) {
      expect(restEndpoints[op]).toMatchObject({ method, path });
    }
  });

  test("Product Media reads and mutations use dedicated cache family plus catalogue invalidation", () => {
    expect(readTags("admin.product-media")).toContain("product-media" as any);
    expect(readTags("admin.product-media.generation")).toContain("product-media" as any);
    for (const op of ["admin.product.create", "admin.product-media.upload", "admin.product-media.generate", "admin.product-media.approve", "admin.product-media.reject", "admin.product-media.archive", "admin.product-media.featured", "admin.product-media.reorder", "admin.product-media.brand-mode"]) {
      expect(invalidatesTags(op)).toContain("product-media" as any);
      expect(invalidatesTags(op)).toContain("catalog");
    }
  });

  test("typed client exposes the complete media studio surface including FormData upload", () => {
    const source = readFileSync("src/services/client.ts", "utf8");
    for (const name of ["productDraftCreate", "productMedia", "productMediaUpload", "productMediaGenerate", "productMediaGeneration", "productMediaApprove", "productMediaReject", "productMediaArchive", "productMediaSetFeatured", "productMediaReorder", "productMediaBrandMode"]) {
      expect(source).toContain(`${name}:`);
    }
    expect(source).toMatch(/productMediaUpload:[\s\S]{0,500}FormData/);
  });

  test("UAT mock returns reviewable media with authenticated preview URLs and deterministic generation status", async () => {
    const mock = new MockServiceAdapter();
    const draft = await mock.request<any>({ op: "admin.product.create", body: { name: "Worker Tomatoes", slug: "worker-tomatoes", categoryId: "cat_fresh" }, skipValidation: true });
    expect(draft.productId).toBeTruthy();
    const upload = new FormData(); upload.set("altText", "Worker Tomatoes"); upload.set("file", new File(["demo"], "tomatoes.png", { type: "image/png" }));
    const media = await mock.request<any>({ op: "admin.product-media.upload", query: { productId: draft.productId }, formData: upload } as any);
    expect(typeof media.previewUrl).toBe("string"); expect(media.previewUrl.length).toBeGreaterThan(10);
    const generated = await mock.request<any>({ op: "admin.product-media.generate", query: { productId: draft.productId }, body: { mode: "unbranded_generation", stylePreset: "clean_studio", backgroundIntent: "plain", candidateCount: 2 }, idempotencyKey: "mock-media-gen-001", skipValidation: true });
    expect(generated.status).toBe("succeeded");
    expect(generated.candidateMediaIds).toHaveLength(2);
    const view = await mock.request<any>({ op: "admin.product-media", query: { productId: draft.productId } });
    expect(view.reviewCandidates.length).toBeGreaterThanOrEqual(3);
    expect(view.reviewCandidates.every((item: any) => item.previewUrl && !item.publicUrl)).toBe(true);
  });
});
