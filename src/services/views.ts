/**
 * Compatibility shim — shared response models now live in the framework-free
 * contracts package (src/services/contracts/), which is where the future
 * NestJS backend and React Native clients will consume them from. This module
 * re-exports them so existing imports keep working during the migration.
 *
 * New code should import from `@/services/contracts` directly.
 */

export type {
  CatalogVariant,
  CatalogProduct,
  CategoryView,
  CategoryRow,
  HomeData,
  ShopPageData,
  ProductPageData,
} from "./contracts/catalog";

export type { ZoneView, SlotView } from "./contracts/checkout";

export type { ReportBundleView } from "./contracts/staff";
