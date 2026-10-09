/**
 * Server-side data adapter for server-rendered pages — the RSC counterpart of
 * `src/services/client.ts`. Together the two adapters form the service
 * boundary:
 *
 *   client components  →  src/services/client.ts   (HTTP → /api/mock/v1)
 *   server components  →  src/services/server-data.ts (in-process → same router)
 *
 * Both are typed against the shared models in `src/services/views.ts`, and
 * both are the swap points when the real backend lands: the client fetches
 * the production API, this module calls the production services (or the same
 * API server-side). Pages never import `src/services/mock` directly.
 */

import { handleApi } from "./mock/router";
import type {
  CatalogProduct,
  CategoryView,
  HomeData,
  ShopPageData,
  SlotView,
  ZoneView,
} from "./views";
import type { Category } from "@/types/domain";

async function call<T>(path: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<T> {
  const query = new URLSearchParams(opts.query ?? {});
  const result = await handleApi({ path, method: opts.body !== undefined ? "POST" : "GET", query, body: opts.body ?? {} });
  const json = result.json as { ok?: boolean; data?: T; error?: { code: string; message: string } };
  if (result.status !== 200 || !json?.ok) {
    throw new Error(json?.error?.message ?? `Service request failed: ${path}`);
  }
  return json.data as T;
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
export async function getCategories(): Promise<(CategoryView & { description?: string; isActive: boolean })[]> {
  return call<(Category & { availableProducts: number })[]>("catalog.categories").then((list) =>
    list.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      tint: c.tint,
      count: c.availableProducts,
      description: c.description,
      isActive: c.isActive,
    }))
  );
}

/** One category by slug, including its description (used for the category page header). */
export async function getCategory(slug: string): Promise<(CategoryView & { description?: string; isActive: boolean }) | null> {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

/** Products of one category, sorted by name — only purchasable items. */
export async function getCategoryProducts(categoryId: string): Promise<CatalogProduct[]> {
  return call<ShopPageData>("catalog.list", {
    query: { query: "", category: categoryId, sort: "name", page: "1", perPage: "48" },
  }).then((r) => r.items);
}

/** Product detail: entry, related products, purchasability. Returns null when not found. */
export async function getProductData(slug: string): Promise<{ product: CatalogProduct; related: CatalogProduct[]; purchasable: boolean } | null> {
  try {
    return await call<{ product: CatalogProduct; related: CatalogProduct[]; purchasable: boolean }>("catalog.product", { query: { slug } });
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
