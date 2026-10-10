/**
 * Shared API contracts — catalogue (public storefront + staff admin).
 * Response shapes mirror the mock router exactly; the proposed REST
 * rendering lives in docs/openapi.yaml (paths /api/v1/catalog/*).
 */

import type { Paged } from "./common";

/* ---------------- public storefront ---------------- */

export interface CatalogVariant {
  id: string;
  name: string;
  unit: string;
  unitSize: string;
  priceMinor: number;
  priceLabel: string;
  compareAtPriceMinor?: number;
  compareAtLabel?: string;
  barcode?: string;
  purchaseUnit?: { altUnit: string; factor: string; baseUnit: string };
  availableToSell: string;
  isAvailable: boolean;
  safetyStock?: string;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  tint?: string;
  shortDescription: string;
  description: string;
  tags: string[];
  image: string;
  variants: CatalogVariant[];
  anyAvailable: boolean;
  minPriceMinor: number;
  minPriceLabel: string;
}

/** Category chip used by the home and shop pages. */
export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  tint?: string;
  count: number;
}

/** Category row including staff-visible fields. */
export interface CategoryRow extends CategoryView {
  description?: string;
  isActive: boolean;
}

/** Everything the storefront homepage needs, assembled by the service. */
export interface HomeData {
  categories: CategoryView[];
  offers: CatalogProduct[];
  popular: CatalogProduct[];
  trendingNew: CatalogProduct[];
  demoTrack?: {
    reference: string;
    verificationCode?: string;
    lastUpdatedAt: string;
    paymentStatus: string;
    partialRefundDemo: boolean;
  };
}

/** Shop grid page: availability-filtered products + page metadata. */
export type ShopPageData = Paged<CatalogProduct>;

export interface ProductPageData {
  product: CatalogProduct;
  related: CatalogProduct[];
  purchasable: boolean;
}

/** `catalog.by-variants` — resolve products for a set of variant IDs. */
export type ByVariantsResponse = CatalogProduct[];

/* ---------------- staff catalogue admin ---------------- */

export interface AdminVariantRow {
  id: string;
  name: string;
  priceLabel: string;
  priceMinor: number;
  barcode?: string;
  unit: string;
  availableToSell: string;
  isAvailable: boolean;
  purchaseUnit?: { altUnit: string; factor: string };
  safetyStock: string;
  isActive: boolean;
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  categoryName?: string;
  categoryId: string;
  isPublished: boolean;
  shortDescription: string;
  image: string;
  variants: AdminVariantRow[];
  anyAvailable: boolean;
}

export interface AdminVariantDetail {
  id: string;
  name: string;
  unit: string;
  unitSize: string;
  priceMinor: number;
  priceLabel: string;
  compareAtPriceMinor?: number;
  barcode?: string;
  purchaseUnit?: { altUnit: string; factor: string; baseUnit: string };
  safetyStock: string;
  isActive: boolean;
  availability: {
    sellablePhysical: string;
    reserved: string;
    availableToSell: string;
    isAvailable: boolean;
  };
  lots: { lotId: string; lotNumber: string; quantity: string; expiryDate?: string; quarantined: boolean; kind: string }[];
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  tags: string[];
  isPublished: boolean;
  categoryName?: string;
  image: string;
  variants: AdminVariantDetail[];
  lots: { id: string; lotNumber: string; quantity: string; kind: string; expiryDate?: string; isQuarantined: boolean }[];
  movements: { id: string; delta: string; reason: string; atLabel: string; note?: string; resultingQty: string }[];
}

export interface AdminCategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  availableCount: number;
}

/** Simple acknowledgement returned by catalogue mutation operations. */
export interface DoneResponse {
  done: boolean;
}
