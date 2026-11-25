/**
 * Server-side data adapter for server-rendered pages — the RSC counterpart of
 * `src/services/client.ts`. Together the two adapters form the service
 * boundary:
 *
 *   client components  → src/services/adapters/browser.ts (HTTP)
 *   server components  → src/services/adapters/server.ts  (API_BASE_URL →
 *                        production HTTP adapter; unset → dev mock adapter)
 *
 * Server rendering and SEO are preserved: pages stay React Server Components;
 * only the data source swaps. Pages never import `src/services/mock` — the
 * adapter layer is the only seam (docs/API_CONTRACTS.md).
 */

import { resolveServerAdapter } from "./adapters/server";
import type { ServiceRequest } from "./adapters/types";
import type {
  CatalogProduct,
  CategoryRow,
  CmsContentPageSlug,
  CmsContentPageView,
  CmsHomepageView,
  HomeData,
  ProductPageData,
  ShopPageData,
  SlotView,
  ZoneView,
} from "./contracts";

async function call<T>(op: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<T> {
  const req: ServiceRequest = { op, query: opts.query, body: opts.body };
  return resolveServerAdapter().request<T>(req);
}

/** Homepage bundle: categories with counts, offers, popular, fresh finds. */
export async function getHomeData(): Promise<HomeData> {
  return call<HomeData>("catalog.home");
}

/** Shop grid: search, category filter, sort, pagination — availability rules applied by the service. */
export async function getShopData(params: { query?: string; category?: string; sort?: string; page?: number; perPage?: number }): Promise<ShopPageData> {
  return call<ShopPageData>("catalog.list", {
    query: {
      query: params.query ?? "",
      category: params.category ?? "",
      sort: params.sort ?? "popular",
      page: params.page !== undefined ? String(params.page) : "1",
      perPage: params.perPage !== undefined ? String(params.perPage) : "12",
    },
  });
}

/** Category chips for the shop sidebar / cross-links (with available counts). */
export async function getCategories(): Promise<CategoryRow[]> {
  return call<CategoryRow[]>("catalog.categories");
}

/** One category by slug, including its description (used for the category page header). */
export async function getCategory(slug: string): Promise<CategoryRow | null> {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

/** Products of one category, sorted by name — only purchasable items. */
export async function getCategoryProducts(categoryId: string): Promise<CatalogProduct[]> {
  return call<ShopPageData>("catalog.list", {
    query: { query: "", category: categoryId, sort: "name", page: "1", perPage: "48" },
  }).then((r) => r.items);
}

/** Product detail: entry, related products, purchasability. Returns null when not found. */
export async function getProductData(slug: string): Promise<ProductPageData | null> {
  try {
    return await call<ProductPageData>("catalog.product", { query: { slug } });
  } catch {
    return null;
  }
}

/** Public delivery configuration for the delivery information page. */
export async function getDeliveryZones(): Promise<ZoneView[]> {
  return call<ZoneView[]>("checkout.zones");
}

/** Public delivery slots for a zone (used by informational pages). */
export async function getDeliverySlots(zoneId: string): Promise<SlotView[]> {
  return call<SlotView[]>("checkout.slots", { query: { zoneId } });
}
/** Published storefront homepage content. */
export async function getCmsHomepage(): Promise<CmsHomepageView> {
  return call<CmsHomepageView>("content.homepage");
}

/** Published owner-editable support/policy content. */
export async function getCmsContentPage(slug: CmsContentPageSlug): Promise<CmsContentPageView> {
  return call<CmsContentPageView>("content.page", { query: { slug } });
}



/** The installation owns its public brand name; do not guess another
 * merchant's identity when the real API is unreachable. */
export async function getPublicBusinessIdentity() {
  const { publicBusinessIdentitySchema } = await import("./contracts");
  if (!process.env.API_BASE_URL && !process.env.NEXT_PUBLIC_API_BASE_URL) {
    return {businessName:"Variety Groceries"};
  }
  try {
    const value=await call<unknown>("content.business-identity");
    return publicBusinessIdentitySchema.parse(value);
  } catch {
    return {businessName:"Storefront"};
  }
}
