/**
 * The single stateful mock store for the Variety Groceries prototype.
 *
 * - Lives in the Node process via `globalThis` so server components and
 *   route handlers share one state.
 * - Dev-server restarts or `demo.reset` reseed the fixtures.
 * - Single-process only; real multi-user concurrency and persistence are
 *   backend responsibilities (see docs/KNOWN_ISSUES.md).
 * - CLIENT COMPONENTS MUST NOT IMPORT THIS MODULE. All client access goes
 *   through /api/mock/v1 (see src/services/client.ts).
 */

import type {
  Address,
  AISuggestion,
  AuditEvent,
  CashierSession,
  Category,
  Customer,
  DeliveryJob,
  DeliveryProvider,
  DeliverySlot,
  DeliveryZone,
  GoodsReceipt,
  HeldDraftSale,
  Location,
  Order,
  OrderLine,
  PaymentAttempt,
  PosTransaction,
  Product,
  ProductVariant,
  PurchaseOrder,
  Refund,
  Reservation,
  ReturnLine,
  ReturnRequest,
  Rider,
  StockAdjustment,
  StockLot,
  StockMovement,
  Stocktake,
  Supplier,
  StaffUser,
} from "@/types/domain";
import type {
  CmsContentPageSlug,
  CmsContentPageView,
  CmsHomepageContent,
  LogisticsNodeView, LogisticsLaneView, DeliveryWorkflowView, DeliveryRouteRuleView,
} from "../contracts";
import { buildCatalog, seedCategories, seedSuppliers } from "./seed-catalog";
import {
  buildAdjustments,
  buildAiSuggestions,
  buildAudit,
  buildCashierSessions,
  buildDeliveryJobs,
  buildMovements,
  buildOrders,
  buildPaymentAttempts,
  buildReservations,
  buildReturns,
  buildSlots,
  buildStocktakes,
  seedAddresses,
  seedCustomers,
  seedProviders,
  seedRiders,
  seedStaff,
  seedZones,
} from "./seed-ops";

export interface IdempotencyRecord {
  scope: string;
  key: string;
  requestHash: string;
  orderId: string;
  createdAt: string;
}

interface CmsVersioned<T> {
  published: T;
  draft: T;
  updatedAt: string;
  publishedAt: string;
}

export interface CmsStoreState {
  homepage: CmsVersioned<CmsHomepageContent>;
  pages: Record<CmsContentPageSlug, CmsVersioned<CmsContentPageView>>;
}

export interface VgStore {
  seededAt: string;
  idempotency: IdempotencyRecord[];
  categories: Category[];
  products: Product[];
  variants: ProductVariant[];
  locations: Location[];
  lots: StockLot[];
  movements: StockMovement[];
  reservations: Reservation[];
  adjustments: StockAdjustment[];
  stocktakes: Stocktake[];
  customers: Customer[];
  addresses: Address[];
  orders: Order[];
  orderLines: OrderLine[];
  paymentAttempts: PaymentAttempt[];
  cashierSessions: CashierSession[];
  heldDrafts: HeldDraftSale[];
  posTransactions: PosTransaction[];
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  riders: Rider[];
  providers: DeliveryProvider[];
  deliveryJobs: DeliveryJob[];
  logisticsNodes: LogisticsNodeView[];
  logisticsLanes: LogisticsLaneView[];
  logisticsWorkflows: DeliveryWorkflowView[];
  logisticsRouteRules: DeliveryRouteRuleView[];
  returnRequests: ReturnRequest[];
  returnLines: ReturnLine[];
  refunds: Refund[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  staff: StaffUser[];
  audit: AuditEvent[];
  aiSuggestions: AISuggestion[];
  cms: CmsStoreState;
  settings: {
    businessName: string;
    supportPhone: string;
    supportEmail: string;
    deliveryEnabled: boolean;
    collectionEnabled: boolean;
    reservationTtlMinutes: number;
    currency: string;
    lowStockThreshold: string;
    refundsRequireApproval: boolean;
    codEnabled: boolean;
  };
  demoFlags: { latencyMs: number; forcePaymentFailure: boolean; offlineMode: boolean };
  sequences: { receipt: number; po: number; rtn: number; stk: number };
}

function cloneCmsValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seedCms(now: Date): CmsStoreState {
  const at = now.toISOString();
  const homepage: CmsHomepageContent = {
    badge: "Fresh selection · live availability",
    headline: "Fresh Groceries",
    emphasis: "Delivered to Your Door",
    body: "Shop fresh produce, Ghanaian staples, proteins, dairy, drinks and household essentials in one stock-aware store. Choose configured delivery or collection and follow your order from checkout to handover.",
    primaryCtaLabel: "Start shopping",
    primaryCtaHref: "/shop",
    secondaryCtaLabel: "Ask shopping assistant",
    secondaryCtaHref: "/assistant",
  };
  const pages: Record<CmsContentPageSlug, CmsContentPageView> = {
    help: {
      slug: "help",
      title: "Help centre",
      intro: "Answers to common questions about shopping, delivery, returns and payments.",
      sections: [
        { heading: "Which payment methods can I use?", body: "Electronic checkout and payment on delivery are supported by the configured payment flow. Provider outcomes must be verified before an order is marked paid." },
        { heading: "Why are some items hidden?", body: "We only show goods that are available to sell right now. Sold-out or fully reserved items stay unavailable until sellable stock returns." },
        { heading: "How does stock reservation work?", body: "Adding to your cart does not reserve stock. Checkout creates a time-limited reservation which is released if the order is cancelled or the reservation expires." },
        { heading: "Do I need an account?", body: "No. Guest checkout is supported. An account helps with repeat shopping, saved addresses and return tracking." },
      ],
    },
    "returns-policy": {
      slug: "returns-policy",
      title: "Returns & refunds policy",
      intro: "A draft framework for returns, inspection, refunds and exchanges.",
      sections: [
        { heading: "What can be returned", body: "Eligible online and counter-order items can be returned in part or in full. Returned quantities can never exceed the quantities originally purchased." },
        { heading: "Condition and inspection", body: "Returned goods are inspected before restock. Damaged, expired or unsafe items remain unsaleable, while uncertain items stay quarantined until a disposition is recorded." },
        { heading: "Refunds", body: "Refund previews use the original paid amounts. Approval is not the same as completed money movement; the final status follows the payment-provider or controlled manual-refund outcome." },
        { heading: "Exchanges", body: "An exchange is recorded as a traceable return plus a new linked sale so the original transaction history is preserved." },
        { heading: "Policy limits", body: "Final return windows, exclusions and delivery-fee treatment remain owner-configured policy decisions before launch." },
      ],
    },
    privacy: {
      slug: "privacy",
      title: "Privacy notice",
      intro: "How Variety Groceries handles customer and order information.",
      sections: [
        { heading: "What we collect", body: "Contact details, delivery addresses, order history and support information are collected only as needed to operate orders and support. Card details are handled on provider-hosted payment pages and are not stored by the storefront." },
        { heading: "How it is used", body: "Information supports order fulfilment, delivery, returns, refunds, service notifications and legitimate fraud prevention." },
        { heading: "Sharing", body: "Delivery and payment providers receive only the information needed for their role. Variety Groceries does not sell customer personal data." },
        { heading: "Your choices", body: "Customers can request appropriate access or correction once production support channels and retention rules are finalized." },
      ],
    },
    terms: {
      slug: "terms",
      title: "Terms of service",
      intro: "Core shopping, payment and fulfilment terms for the Variety Groceries service.",
      sections: [
        { heading: "Orders and stock", body: "Orders are subject to current availability and price verification. Substitutions require recorded customer permission." },
        { heading: "Prices and totals", body: "Prices are displayed in Ghana cedis. Authoritative totals, fees, discounts and configured tax treatment are calculated by the service at checkout." },
        { heading: "Payment", body: "Electronic payment is confirmed only after a verified provider outcome. Unknown outcomes remain pending or require review rather than being charged again blindly." },
        { heading: "Delivery and collection", body: "Delivery and collection follow configured zones, fees, operating windows and capacity. Failed deliveries may be rescheduled or returned to store under the recorded workflow." },
      ],
    },
  };
  return {
    homepage: { published: cloneCmsValue(homepage), draft: cloneCmsValue(homepage), updatedAt: at, publishedAt: at },
    pages: Object.fromEntries(Object.entries(pages).map(([slug, page]) => [slug, { published: cloneCmsValue(page), draft: cloneCmsValue(page), updatedAt: at, publishedAt: at }])) as CmsStoreState["pages"],
  };
}

function seedStore(): VgStore {
  const now = new Date();
  const catalog = buildCatalog(now);
  const { orders, orderLines } = buildOrders(now);
  const { returnRequests, returnLines, refunds } = buildReturns(now);

  const store: VgStore = {
    seededAt: now.toISOString(),
    idempotency: [],
    categories: seedCategories,
    products: catalog.products,
    variants: catalog.variants,
    locations: [
      { id: "loc_store", name: "Shop floor (demo)", kind: "store", address: "Demo location — store floor", isActive: true },
      { id: "loc_backroom", name: "Backroom (demo)", kind: "backroom", address: "Demo location — backroom", isActive: true },
      { id: "loc_quarantine", name: "Quarantine (demo)", kind: "quarantine", address: "Demo location — quarantine cage", isActive: true },
    ],
    lots: catalog.lots,
    movements: buildMovements(now),
    reservations: buildReservations(now),
    adjustments: buildAdjustments(now),
    stocktakes: buildStocktakes(now),
    customers: seedCustomers,
    addresses: seedAddresses,
    orders,
    orderLines,
    paymentAttempts: buildPaymentAttempts(now),
    cashierSessions: buildCashierSessions(now),
    heldDrafts: [],
    posTransactions: [
      { orderId: "ord_1005", receiptNo: "R-00001", at: orders.find((o) => o.id === "ord_1005")!.createdAt, method: "cash_counter", totalMinor: 3200, cashierName: "Adjoa Yeboah" },
      { orderId: "ord_1006", receiptNo: "R-00002", at: orders.find((o) => o.id === "ord_1006")!.createdAt, method: "card_hosted", totalMinor: 7000, cashierName: "Adjoa Yeboah" },
    ],
    zones: seedZones,
    slots: buildSlots(now),
    riders: seedRiders,
    providers: seedProviders,
    deliveryJobs: buildDeliveryJobs(now),
    logisticsNodes: [{
      id: "lnode_demo_hq", code: "DEMO_HQ", name: "Accra Head Office (demo)", publicName: "Accra Head Office (demo)",
      kind: "head_office", inventoryLocationId: "loc_store", customerVisible: true, active: true,
      addressLine: "Demo source facility", locality: "Accra", region: "Greater Accra",
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
      dependencies: { activeIncomingLanes: 0, activeOutgoingLanes: 0, activeRouteRules: 1, childNodes: 0, inventoryLocationExists: true, inventoryLocationActive: true },
    }],
    logisticsLanes: [],
    logisticsWorkflows: [{
      id: "lwf_demo_direct", name: "Direct doorstep workflow (demo)", description: "Development-only logistics configuration.", active: true,
      currentPublishedVersionId: "lwv_demo_direct_1", createdAt: now.toISOString(), updatedAt: now.toISOString(),
      versions: [{
        id: "lwv_demo_direct_1", templateId: "lwf_demo_direct", versionNumber: 1, status: "published", revision: 1,
        createdBy: "demo-owner", createdAt: now.toISOString(), publishedBy: "demo-owner", publishedAt: now.toISOString(),
        defaultSlaMinutes: 240,
        stages: [
          { id: "lstg_demo_placed", stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Order placed", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
          { id: "lstg_demo_delivered", stageKey: "delivered", eventKind: "delivered", customerTitleTemplate: "Delivered", adminLabel: "Delivered", customerVisible: true, showPlannedWhenPending: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
        ],
      }],
    }],
    logisticsRouteRules: [{
      id: "lroute_demo_direct", name: "Accra Central direct doorstep (demo)", originNodeId: "lnode_demo_hq", deliveryZoneId: "zone_c", fulfilment: "delivery",
      destinationKind: "doorstep", workflowVersionId: "lwv_demo_direct_1", priority: 10, active: true, version: 1, createdBy: "demo-owner",
      stops: [{ id: "lrstop_demo_direct_1", position: 1, nodeId: "lnode_demo_hq", terminalRole: "final_mile_dispatch" }], legs: [],
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    }],
    returnRequests,
    returnLines,
    refunds,
    suppliers: seedSuppliers,
    purchaseOrders: catalog.purchaseOrders,
    goodsReceipts: catalog.goodsReceipts,
    staff: seedStaff,
    audit: buildAudit(now),
    aiSuggestions: buildAiSuggestions(now),
    cms: seedCms(now),
    settings: {
      businessName: "Variety Groceries",
      supportPhone: "+233 30 000 0000 (demo)",
      supportEmail: "support@varietygrocery.com (demo inbox — not live)",
      deliveryEnabled: true,
      collectionEnabled: true,
      reservationTtlMinutes: 30,
      currency: "GHS",
      lowStockThreshold: "3",
      refundsRequireApproval: true,
      codEnabled: true,
    },
    demoFlags: { latencyMs: 0, forcePaymentFailure: false, offlineMode: false },
    sequences: { receipt: 3, po: 10, rtn: 2004, stk: 12 },
  };
  return store;
}

declare global {
  var __vg_store__: VgStore | undefined;
}

export function getStore(): VgStore {
  if (!globalThis.__vg_store__) {
    globalThis.__vg_store__ = seedStore();
  }
  return globalThis.__vg_store__;
}

export function resetStore(): void {
  globalThis.__vg_store__ = seedStore();
}

/** Monotonic sequence helper, e.g. nextSeq(store, "receipt"). */
export function nextSeq(store: VgStore, key: keyof VgStore["sequences"]): number {
  store.sequences[key] += 1;
  return store.sequences[key];
}
