/**
 * Shared response models — the contract between the app's screens and the
 * service adapters. Lives OUTSIDE `src/services/mock` so that:
 *
 *  - server-rendered pages use it via `src/services/server-data.ts`
 *  - client components use it via `src/services/client.ts`
 *  - both adapters are swapped together when the real backend lands
 *
 * The mock router/engines produce these shapes; nothing here may import
 * from the mock layer (dependency direction is mock → shared, never the
 * reverse).
 */

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

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

export interface ShopPageData {
  items: CatalogProduct[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

/* ------------------------------------------------------------------ */
/* Delivery configuration (public)                                     */
/* ------------------------------------------------------------------ */

export interface ZoneView {
  id: string;
  name: string;
  areas: string[];
  feeMinor: number;
  minimumOrderMinor: number;
  serviceHours: string;
  cutoff: string;
  slotsPerDay: number;
  isActive: boolean;
}

export interface SlotView {
  id: string;
  zoneId: string;
  date: string;
  window: string;
  capacity: number;
  booked: number;
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

/** Reports bundle shared by the admin reports screen and the client adapter. */
export interface ReportBundleView {
  salesByDay: { date: string; onlineMinor: number; posMinor: number; orders: number }[];
  topProducts: { name: string; variant: string; qty: number; revenueMinor: number }[];
  fulfilmentCounts: Record<string, number>;
  deliveryCounts: Record<string, number>;
  returnsSummary: { total: number; pending: number; resolved: number; refundedMinor: number };
  cashSummary: { openSessions: number; expectedMinor: number; lastClosedDiffMinor: number };
  stockValue: { costBasisMinor: number; sellableUnits: number; zeroVariants: number; lowVariants: number };
  paymentsReconciliation: { settled: number; unsettled: number; exceptions: number };
}
