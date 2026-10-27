import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AdminCategoryRow, AdminProductDetail, AdminProductRow } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;
type AvailabilityRow = {
  variantId: string;
  sellablePhysical: Prisma.Decimal;
  reserved: Prisma.Decimal;
  safetyStock: Prisma.Decimal;
  availableToSell: Prisma.Decimal;
};

@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private async availability(variantIds: string[]) {
    if (!variantIds.length) return new Map<string, AvailabilityRow>();
    const rows = await this.db.$queryRaw<AvailabilityRow[]>`
      SELECT "variantId","sellablePhysical",reserved,"safetyStock","availableToSell"
      FROM variant_availability
      WHERE "variantId" IN (${Prisma.join(variantIds)}) AND "locationId"=${this.config.stockLocationId}`;
    return new Map(rows.map((row) => [row.variantId, row]));
  }

  private image(product: { image: string; featuredMedia: { status: string; archivedAt: Date | null; publicUrl: string | null } | null }) {
    const featured = product.featuredMedia;
    return featured?.status === "approved" && featured.archivedAt === null && featured.publicUrl
      ? featured.publicUrl
      : product.image || "/logo.svg";
  }

  async listProducts(search = ""): Promise<AdminProductRow[]> {
    const q = search.trim();
    const products = await this.db.product.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      include: { category: true, variants: { orderBy: { id: "asc" } }, featuredMedia: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const available = await this.availability(products.flatMap((product) => product.variants.map((variant) => variant.id)));
    return products.map((product) => {
      const variants = product.variants.map((variant) => {
        const row = available.get(variant.id);
        const availableToSell = row?.availableToSell.toString() ?? "0";
        return {
          id: variant.id,
          name: variant.name,
          priceLabel: money(variant.priceMinor),
          priceMinor: variant.priceMinor,
          ...(variant.barcode ? { barcode: variant.barcode } : {}),
          unit: variant.unit,
          availableToSell,
          isAvailable: variant.active && new Prisma.Decimal(availableToSell).gt(0),
          safetyStock: row?.safetyStock.toString() ?? "0",
          isActive: variant.active,
        };
      });
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        categoryName: product.category.name,
        categoryId: product.categoryId,
        isPublished: product.published,
        shortDescription: product.shortDescription,
        image: this.image(product),
        variants,
        anyAvailable: variants.some((variant) => variant.isAvailable),
      };
    });
  }

  async productDetail(productId: string): Promise<AdminProductDetail> {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      include: { category: true, variants: { orderBy: { id: "asc" } }, featuredMedia: true },
    });
    if (!product) throw new ApiProblem(404, "NOT_FOUND", "Product not found.");

    const variantIds = product.variants.map((variant) => variant.id);
    const available = await this.availability(variantIds);
    const lots = variantIds.length
      ? await this.db.stockLot.findMany({
          where: { position: { variantId: { in: variantIds }, locationId: this.config.stockLocationId } },
          include: { position: { select: { variantId: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : [];
    const movements = variantIds.length
      ? await this.db.stockMovement.findMany({
          where: { lot: { position: { variantId: { in: variantIds }, locationId: this.config.stockLocationId } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
        })
      : [];
    const lotsByVariant = new Map<string, typeof lots>();
    for (const lot of lots) {
      const bucket = lotsByVariant.get(lot.position.variantId) ?? [];
      bucket.push(lot);
      lotsByVariant.set(lot.position.variantId, bucket);
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      tags: product.tags,
      isPublished: product.published,
      categoryName: product.category.name,
      image: this.image(product),
      variants: product.variants.map((variant) => {
        const row = available.get(variant.id);
        const sellablePhysical = row?.sellablePhysical.toString() ?? "0";
        const reserved = row?.reserved.toString() ?? "0";
        const availableToSell = row?.availableToSell.toString() ?? "0";
        return {
          id: variant.id,
          name: variant.name,
          unit: variant.unit,
          unitSize: variant.unitSize,
          priceMinor: variant.priceMinor,
          priceLabel: money(variant.priceMinor),
          ...(variant.compareAtPriceMinor !== null ? { compareAtPriceMinor: variant.compareAtPriceMinor } : {}),
          ...(variant.barcode ? { barcode: variant.barcode } : {}),
          safetyStock: row?.safetyStock.toString() ?? "0",
          isActive: variant.active,
          availability: {
            sellablePhysical,
            reserved,
            availableToSell,
            isAvailable: variant.active && new Prisma.Decimal(availableToSell).gt(0),
          },
          lots: (lotsByVariant.get(variant.id) ?? []).map((lot) => ({
            lotId: lot.id,
            lotNumber: lot.lotNumber,
            quantity: lot.quantity.toString(),
            ...(lot.expiryDate ? { expiryDate: lot.expiryDate.toISOString().slice(0, 10) } : {}),
            quarantined: lot.quarantined,
            kind: lot.kind,
          })),
        };
      }),
      lots: lots.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        quantity: lot.quantity.toString(),
        kind: lot.kind,
        ...(lot.expiryDate ? { expiryDate: lot.expiryDate.toISOString().slice(0, 10) } : {}),
        isQuarantined: lot.quarantined,
      })),
      movements: movements.map((movement) => ({
        id: movement.id,
        delta: movement.delta.toString(),
        reason: movement.reason,
        atLabel: movement.createdAt.toISOString(),
        resultingQty: movement.resultingQty.toString(),
      })),
    };
  }

  async categories(): Promise<AdminCategoryRow[]> {
    const rows = await this.db.$queryRaw<{
      id: string; slug: string; name: string; description: string; active: boolean; sortOrder: number; productCount: bigint; availableCount: bigint;
    }[]>`
      SELECT c.id,c.slug,c.name,c.description,c.active,c."sortOrder",
        (SELECT count(*) FROM "Product" p WHERE p."categoryId"=c.id) AS "productCount",
        (SELECT count(*) FROM "Product" p WHERE p."categoryId"=c.id AND p.published
          AND EXISTS (SELECT 1 FROM "Variant" v JOIN variant_availability a ON a."variantId"=v.id
            WHERE v."productId"=p.id AND v.active AND a."locationId"=${this.config.stockLocationId} AND a."availableToSell">0)) AS "availableCount"
      FROM "Category" c ORDER BY c."sortOrder",c.name,c.id`;
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isActive: row.active,
      sortOrder: row.sortOrder,
      productCount: Number(row.productCount),
      availableCount: row.active ? Number(row.availableCount) : 0,
    }));
  }

  async createDraft(actorId: string, requestId: string, input: import("@variety/contracts").CreateProductDraftRequest): Promise<{ productId: string; editorPath: string }> {
    const category = await this.db.category.findUnique({ where: { id: input.categoryId } });
    if (!category?.active) throw new ApiProblem(404, "CATEGORY_NOT_FOUND", "Active category not found.");
    try {
      return await this.db.$transaction(async (tx) => {
        const product = await tx.product.create({ data: { name: input.name, slug: input.slug, categoryId: input.categoryId, shortDescription: input.shortDescription ?? "", description: input.description ?? "", tags: input.tags ?? [], image: "", published: false, brandMode: "auto" } });
        await tx.auditEvent.create({ data: { actorId, action: "catalog.product.draft.created", entityId: product.id, requestId, details: { slug: product.slug, categoryId: product.categoryId } } });
        return { productId: product.id, editorPath: `/admin/products/${product.id}` };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiProblem(409, "PRODUCT_SLUG_CONFLICT", "A product already uses that slug.");
      throw error;
    }
  }
}
