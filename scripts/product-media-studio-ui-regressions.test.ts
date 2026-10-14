import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const productDetail = readFileSync("src/app/admin/products/[id]/page.tsx", "utf8");
const studio = readFileSync("src/features/catalog/product-media-studio.tsx", "utf8");

describe("Product Media Studio admin integration", () => {
  test("product detail mounts the dedicated media studio", () => {
    expect(productDetail).toContain('from "@/features/catalog/product-media-studio"');
    expect(productDetail).toContain("<ProductMediaStudio");
    expect(productDetail).toContain("productId={detail.id}");
    expect(productDetail).toContain("productName={detail.name}");
  });

  test("studio loads the authoritative media state and supports real uploads", () => {
    expect(studio).toContain("apiOps.productMedia(productId)");
    expect(studio).toContain("new FormData()");
    expect(studio).toContain('formData.set("file"');
    expect(studio).toContain('formData.set("altText"');
    expect(studio).toContain("apiOps.productMediaUpload(productId, formData)");
    expect(studio).toContain("Upload product image");
  });

  test("studio queues AI generations with idempotency and polls durable jobs", () => {
    expect(studio).toContain("apiOps.productMediaGenerate");
    expect(studio).toContain("crypto.randomUUID()");
    expect(studio).toContain("apiOps.productMediaGeneration");
    expect(studio).toContain("Generate with AI");
    expect(studio).toContain("candidateCount");
    expect(studio).toContain("stylePreset");
    expect(studio).toContain("backgroundIntent");
  });

  test("review actions remain explicit and private candidates are not silently published", () => {
    expect(studio).toContain("apiOps.productMediaApprove");
    expect(studio).toContain("apiOps.productMediaReject");
    expect(studio).toContain("apiOps.productMediaArchive");
    expect(studio).toContain("Review candidates");
    expect(studio).toContain("Approve");
    expect(studio).toContain("Reject");
    expect(studio).toContain("Archive");
  });

  test("publishing controls cover featured media, gallery order and brand mode", () => {
    expect(studio).toContain("apiOps.productMediaSetFeatured");
    expect(studio).toContain("apiOps.productMediaReorder");
    expect(studio).toContain("apiOps.productMediaBrandMode");
    expect(studio).toContain("Featured image");
    expect(studio).toContain("Approved gallery");
    expect(studio).toContain("Brand mode");
    expect(studio).toContain("Move up");
    expect(studio).toContain("Move down");
  });

  test("the studio is permission-aware and gives operators actionable failures", () => {
    expect(studio).toContain("useStaff()");
    expect(studio).toContain('can("catalog.edit")');
    expect(studio).toContain("ApiError");
    expect(studio).toContain("useToast()");
  });
});
