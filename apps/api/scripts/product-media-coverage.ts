import { Database } from "../src/database/database";
import { readConfig } from "../src/config";

export interface ProductMediaCoverageInput {
  id: string;
  image: string;
  featuredMediaId: string | null;
  media: Array<{
    id: string;
    status: string;
    publicUrl: string | null;
    archivedAt: Date | null;
  }>;
}

export interface ProductMediaCoverageReport {
  publishedProducts: number;
  approvedFeaturedProducts: number;
  approvedMediaProducts: number;
  legacyFallbackOnlyProducts: number;
  productsWithoutImageAuthority: number;
  approvedFeaturedCoveragePercent: number;
  fullCoverage: boolean;
}

export function summarizeProductMediaCoverage(
  products: ProductMediaCoverageInput[],
): ProductMediaCoverageReport {
  let approvedFeaturedProducts = 0;
  let approvedMediaProducts = 0;
  let legacyFallbackOnlyProducts = 0;
  let productsWithoutImageAuthority = 0;

  for (const product of products) {
    const approved = product.media.filter(
      (media) =>
        media.status === "approved" &&
        media.archivedAt === null &&
        Boolean(media.publicUrl),
    );
    const featured = product.featuredMediaId
      ? approved.find((media) => media.id === product.featuredMediaId)
      : undefined;

    if (approved.length) approvedMediaProducts += 1;
    if (featured) {
      approvedFeaturedProducts += 1;
      continue;
    }
    if (product.image.trim()) legacyFallbackOnlyProducts += 1;
    else productsWithoutImageAuthority += 1;
  }

  const publishedProducts = products.length;
  const approvedFeaturedCoveragePercent = publishedProducts
    ? Math.round((approvedFeaturedProducts / publishedProducts) * 10_000) / 100
    : 100;

  return {
    publishedProducts,
    approvedFeaturedProducts,
    approvedMediaProducts,
    legacyFallbackOnlyProducts,
    productsWithoutImageAuthority,
    approvedFeaturedCoveragePercent,
    fullCoverage:
      publishedProducts === approvedFeaturedProducts &&
      legacyFallbackOnlyProducts === 0 &&
      productsWithoutImageAuthority === 0,
  };
}

async function main() {
  const config = readConfig();
  const db = new Database(config);
  await db.$connect();
  try {
    const products = await db.product.findMany({
      where: { published: true },
      orderBy: { id: "asc" },
      select: {
        id: true,
        image: true,
        featuredMediaId: true,
        media: {
          select: {
            id: true,
            status: true,
            publicUrl: true,
            archivedAt: true,
          },
        },
      },
    });
    const report = summarizeProductMediaCoverage(products);
    console.log(JSON.stringify({ event: "product_media.coverage", ...report }));
    if (process.argv.includes("--require-full") && !report.fullCoverage)
      process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "product_media.coverage.failed",
        errorType: error instanceof Error ? error.name : "unknown",
        message:
          error instanceof Error
            ? error.message
            : "Product media coverage report failed.",
      }),
    );
    process.exitCode = 1;
  });
}
