import test from "node:test";
import assert from "node:assert/strict";
import { summarizeProductMediaCoverage } from "../scripts/product-media-coverage";

test("coverage report distinguishes approved featured media from legacy fallback", () => {
  const report = summarizeProductMediaCoverage([
    {
      id: "approved",
      image: "/legacy-approved.webp",
      featuredMediaId: "media-approved",
      media: [
        {
          id: "media-approved",
          status: "approved",
          publicUrl: "https://media.example.test/approved.webp",
          archivedAt: null,
        },
      ],
    },
    {
      id: "legacy-only",
      image: "/legacy-only.webp",
      featuredMediaId: null,
      media: [],
    },
    {
      id: "missing",
      image: "",
      featuredMediaId: null,
      media: [],
    },
  ]);

  assert.deepEqual(report, {
    publishedProducts: 3,
    approvedFeaturedProducts: 1,
    approvedMediaProducts: 1,
    legacyFallbackOnlyProducts: 1,
    productsWithoutImageAuthority: 1,
    approvedFeaturedCoveragePercent: 33.33,
    fullCoverage: false,
  });
});

test("coverage is complete only when every published product has approved public featured media", () => {
  const report = summarizeProductMediaCoverage([
    {
      id: "one",
      image: "",
      featuredMediaId: "m1",
      media: [
        {
          id: "m1",
          status: "approved",
          publicUrl: "https://media.example.test/m1.webp",
          archivedAt: null,
        },
      ],
    },
    {
      id: "two",
      image: "/legacy.webp",
      featuredMediaId: "m2",
      media: [
        {
          id: "m2",
          status: "approved",
          publicUrl: "https://media.example.test/m2.webp",
          archivedAt: null,
        },
      ],
    },
  ]);

  assert.equal(report.approvedFeaturedCoveragePercent, 100);
  assert.equal(report.fullCoverage, true);
});
