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

export interface VgStore {
  seededAt: string;
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
  returnRequests: ReturnRequest[];
  returnLines: ReturnLine[];
  refunds: Refund[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  staff: StaffUser[];
  audit: AuditEvent[];
  aiSuggestions: AISuggestion[];
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

function seedStore(): VgStore {
  const now = new Date();
  const catalog = buildCatalog(now);
  const { orders, orderLines } = buildOrders(now);
  const { returnRequests, returnLines, refunds } = buildReturns(now);

  const store: VgStore = {
    seededAt: now.toISOString(),
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
    returnRequests,
    returnLines,
    refunds,
    suppliers: seedSuppliers,
    purchaseOrders: catalog.purchaseOrders,
    goodsReceipts: catalog.goodsReceipts,
    staff: seedStaff,
    audit: buildAudit(now),
    aiSuggestions: buildAiSuggestions(now),
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
