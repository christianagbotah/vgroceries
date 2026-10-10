import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CatalogProduct, CatalogVariant } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

type ProductRecord = Prisma.ProductGetPayload<{
  include: { category: true; variants: true };
}>;
type Availability = {
  variantId: string;
  availableToSell: Prisma.Decimal;
  safetyStock: Prisma.Decimal;
};
export const priceLabel = (minor: number) => `₵${(minor / 100).toFixed(2)}`;
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  private eligible() {
    return Prisma.sql`p.published AND EXISTS(SELECT 1 FROM "Category" c WHERE c.id=p."categoryId" AND c.active)
      AND EXISTS(SELECT 1 FROM "Variant" v JOIN variant_availability a ON a."variantId"=v.id WHERE v."productId"=p.id AND v.active AND a."locationId"=${this.config.stockLocationId} AND a."availableToSell">0)`;
  }
  private async map(records: ProductRecord[]): Promise<CatalogProduct[]> {
    const ids = records.flatMap((p) => p.variants.map((v) => v.id));
    const available = ids.length
      ? await this.db.$queryRaw<
          Availability[]
        >`SELECT "variantId","availableToSell","safetyStock" FROM variant_availability WHERE "variantId" IN (${Prisma.join(ids)}) AND "locationId"=${this.config.stockLocationId}`
      : [];
    const map = new Map(available.map((a) => [a.variantId, a]));
    return records.map((p) => {
      const variants: CatalogVariant[] = p.variants
        .filter((v) => v.active)
        .map((v) => {
          const a = map.get(v.id);
          const quantity = a?.availableToSell.toString() ?? "0";
          return {
            id: v.id,
            name: v.name,
            unit: v.unit,
            unitSize: v.unitSize,
            priceMinor: v.priceMinor,
            priceLabel: priceLabel(v.priceMinor),
            availableToSell: quantity,
            isAvailable: new Prisma.Decimal(quantity).gt(0),
            ...(v.compareAtPriceMinor !== null
              ? {
                  compareAtPriceMinor: v.compareAtPriceMinor,
                  compareAtLabel: priceLabel(v.compareAtPriceMinor),
                }
              : {}),
            ...(v.barcode ? { barcode: v.barcode } : {}),
            safetyStock: a?.safetyStock.toString() ?? "0",
          };
        });
      const minPriceMinor = variants.length
        ? Math.min(...variants.map((v) => v.priceMinor))
        : 0;
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        categorySlug: p.category.slug,
        shortDescription: p.shortDescription,
        description: p.description,
        tags: p.tags,
        image: p.image,
        variants,
        anyAvailable: variants.some((v) => v.isAvailable),
        minPriceMinor,
        minPriceLabel: priceLabel(minPriceMinor),
      };
    });
  }
  private async records(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.db.product.findMany({
      where: { id: { in: ids }, published: true, category: { active: true } },
      include: {
        category: true,
        variants: { where: { active: true }, orderBy: { id: "asc" } },
      },
    });
    const index = new Map(rows.map((p) => [p.id, p]));
    return ids.flatMap((id) => (index.has(id) ? [index.get(id)!] : []));
  }
  async list(query: {
    q: string;
    category?: string;
    page: number;
    perPage: number;
    sort: string;
  }) {
    const where = Prisma.sql`${this.eligible()} ${query.category ? Prisma.sql`AND p."categoryId"=${query.category}` : Prisma.empty}
      ${query.q ? Prisma.sql`AND (p.name ILIKE ${"%" + query.q + "%"} OR p."shortDescription" ILIKE ${"%" + query.q + "%"} OR array_to_string(p.tags,' ') ILIKE ${"%" + query.q + "%"})` : Prisma.empty}`;
    const price = Prisma.sql`(SELECT min(v."priceMinor") FROM "Variant" v WHERE v."productId"=p.id AND v.active)`;
    const order =
      query.sort === "price-asc"
        ? Prisma.sql`${price} ASC,p.id ASC`
        : query.sort === "price-desc"
          ? Prisma.sql`${price} DESC,p.id ASC`
          : Prisma.sql`p.name ASC,p.id ASC`;
    const ids = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT p.id FROM "Product" p WHERE ${where} ORDER BY ${order} LIMIT ${query.perPage} OFFSET ${(query.page - 1) * query.perPage}`;
    const [count] = await this.db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM "Product" p WHERE ${where}`;
    const total = Number(count.total);
    return {
      items: await this.map(await this.records(ids.map((x) => x.id))),
      total,
      page: query.page,
      perPage: query.perPage,
      pages: Math.max(1, Math.ceil(total / query.perPage)),
    };
  }
  async detail(slug: string) {
    const p = await this.db.product.findFirst({
      where: { slug, published: true, category: { active: true } },
      include: {
        category: true,
        variants: { where: { active: true }, orderBy: { id: "asc" } },
      },
    });
    if (!p) throw new ApiProblem(404, "NOT_FOUND", "Product not found.");
    const [product] = await this.map([p]);
    const related = (
      await this.list({
        q: "",
        category: p.categoryId,
        page: 1,
        perPage: 5,
        sort: "name",
      })
    ).items
      .filter((x) => x.id !== p.id)
      .slice(0, 4);
    return { product, related, purchasable: product.anyAvailable };
  }
  async categories() {
    const rows = await this.db.$queryRaw<
      {
        id: string;
        slug: string;
        name: string;
        description: string;
        tint: string | null;
        count: bigint;
      }[]
    >`SELECT c.id,c.slug,c.name,c.description,c.tint,(SELECT count(*) FROM "Product" p WHERE p."categoryId"=c.id AND ${this.eligible()}) AS count FROM "Category" c WHERE c.active ORDER BY c."sortOrder",c.name,c.id`;
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      ...(c.tint ? { tint: c.tint } : {}),
      count: Number(c.count),
      availableProducts: Number(c.count),
      isActive: true,
    }));
  }
  async home() {
    const ids = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT p.id FROM "Product" p WHERE ${this.eligible()} ORDER BY p."createdAt" DESC,p.id LIMIT 4`;
    const offers = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT p.id FROM "Product" p WHERE ${this.eligible()} AND EXISTS(SELECT 1 FROM "Variant" v WHERE v."productId"=p.id AND v.active AND v."compareAtPriceMinor">v."priceMinor") ORDER BY p.name,p.id LIMIT 4`;
    return {
      categories: await this.categories(),
      offers: await this.map(await this.records(offers.map((x) => x.id))),
      popular: [],
      trendingNew: await this.map(await this.records(ids.map((x) => x.id))),
    };
  }
  async byVariants(ids: string[]) {
    const products = await this.db.product.findMany({
      where: {
        published: true,
        category: { active: true },
        variants: { some: { id: { in: [...new Set(ids)] }, active: true } },
      },
      include: {
        category: true,
        variants: { where: { active: true }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    });
    return this.map(products);
  }
}
