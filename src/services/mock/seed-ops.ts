/**
 * Seed fixtures — operations: staff, riders, zones, slots, customers,
 * addresses, orders, reservations, payments, POS sessions, delivery jobs,
 * returns, refunds, stocktakes, adjustments, audit and AI suggestions.
 *
 * Every record is fictional demo data for the Ghana market. Phones use
 * +233 demo numbers; addresses are demo Ghana localities.
 */

import type {
  Address,
  AISuggestion,
  AuditEvent,
  CashierSession,
  Customer,
  DeliveryJob,
  DeliveryProvider,
  DeliverySlot,
  DeliveryZone,
  Order,
  OrderLine,
  PaymentAttempt,
  Refund,
  Reservation,
  ReturnLine,
  ReturnRequest,
  Rider,
  StockAdjustment,
  StockMovement,
  Stocktake,
  StaffUser,
} from "@/types/domain";
import { isoMinusDays, isoMinusMinutes, isoPlusDays, isoPlusMinutes } from "@/lib/id";

export const seedStaff: StaffUser[] = [
  { id: "stf_ama", name: "Ama Boateng", role: "owner_admin", phone: "+233510000001", isDemo: true },
  { id: "stf_kojo", name: "Kojo Asante", role: "operations_manager", phone: "+233510000002", isDemo: true },
  { id: "stf_nana", name: "Nana Yaa Osei", role: "inventory_officer", phone: "+233510000003", isDemo: true },
  { id: "stf_adjoa", name: "Adjoa Yeboah", role: "cashier", phone: "+233510000004", isDemo: true },
  { id: "stf_kweku", name: "Kweku Fosu", role: "picker_packer", phone: "+233510000005", isDemo: true },
  { id: "stf_dela", name: "Dela Agbeko", role: "dispatcher", phone: "+233510000006", isDemo: true },
  { id: "stf_serwaa", name: "Serwaa Owusu", role: "finance_reviewer", phone: "+233510000007", isDemo: true },
];

export const seedRiders: Rider[] = [
  { id: "rdr_kwabena", name: "Kwabena Mensah", phone: "+233201000101", kind: "in_house", vehicle: "motorcycle", zoneIds: ["zone_c", "zone_n", "zone_e"], isAvailable: false, activeJobId: "job_5002", lastLocationAt: isoMinusMinutes(25), lastLocationLabel: "Dansoman roundabout (demo)", isDemo: true },
  { id: "rdr_yaw", name: "Yaw Owusu", phone: "+233201000102", kind: "in_house", vehicle: "motorcycle", zoneIds: ["zone_c", "zone_e", "zone_w"], isAvailable: false, activeJobId: "job_5001", lastLocationAt: isoMinusMinutes(4), lastLocationLabel: "Weija junction (demo)", isDemo: true },
  { id: "rdr_abena", name: "Abena Dufie", phone: "+233201000103", kind: "contracted", vehicle: "motorcycle", zoneIds: ["zone_c", "zone_n"], isAvailable: true, isDemo: true },
  { id: "rdr_kofi", name: "Kofi Boateng", phone: "+233201000104", kind: "contracted", vehicle: "bicycle", zoneIds: ["zone_c"], isAvailable: true, isDemo: true },
  { id: "rdr_efua", name: "Efua Sarpong", phone: "+233201000105", kind: "in_house", vehicle: "car", zoneIds: ["zone_w", "zone_t"], isAvailable: false, isDemo: true },
];

export const seedProviders: DeliveryProvider[] = [
  { id: "prv_inhouse", name: "In-house riders (Variety Groceries)", capabilities: ["quote", "book", "cancel", "status", "proof_of_delivery"], status: "configured", notes: "Managed directly from the dispatch dashboard." },
  { id: "prv_cityswift", name: "CitySwift Dispatch (demo)", capabilities: ["quote", "book", "cancel", "status", "webhook", "proof_of_delivery"], status: "not_connected", notes: "Candidate third-party adapter. Not integrated; coverage, terms and technical access to be checked by the owner before any connection." },
  { id: "prv_metroriders", name: "MetroRiders GH (demo)", capabilities: ["quote", "book", "status"], status: "not_connected", notes: "Candidate third-party adapter. Not integrated; no API claims made." },
];

export const seedZones: DeliveryZone[] = [
  { id: "zone_c", name: "Accra Central", areas: ["Osu", "Labone", "Cantonments", "Adabraka"], feeMinor: 1500, minimumOrderMinor: 6000, serviceHours: "Mon–Sat, 08:00–18:00", cutoff: "Same-day orders close 16:00", slotsPerDay: 3, isActive: true },
  { id: "zone_n", name: "Accra North", areas: ["Achimota", "Airport Residential", "Legon"], feeMinor: 2000, minimumOrderMinor: 8000, serviceHours: "Mon–Sat, 08:00–18:00", cutoff: "Same-day orders close 15:00", slotsPerDay: 3, isActive: true },
  { id: "zone_e", name: "Accra East", areas: ["Madina", "Adenta", "Oyarifa"], feeMinor: 2000, minimumOrderMinor: 8000, serviceHours: "Mon–Sat, 08:00–18:00", cutoff: "Same-day orders close 15:00", slotsPerDay: 3, isActive: true },
  { id: "zone_w", name: "Accra West", areas: ["Kaneshie", "Dansoman", "Weija", "Kasoa"], feeMinor: 2500, minimumOrderMinor: 10000, serviceHours: "Mon–Sat, 08:00–18:00", cutoff: "Same-day orders close 14:00", slotsPerDay: 2, isActive: true },
  { id: "zone_t", name: "Tema", areas: ["Communities 1–25", "Ashaiman"], feeMinor: 3000, minimumOrderMinor: 12000, serviceHours: "Mon–Sat, 09:00–17:00", cutoff: "Same-day orders close 12:00", slotsPerDay: 2, isActive: true },
];

export function buildSlots(now: Date): DeliverySlot[] {
  const slots: DeliverySlot[] = [];
  const windows = ["08:00–11:00", "12:00–15:00", "16:00–18:00"];
  for (let d = 0; d < 3; d++) {
    const date = new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);
    for (const zone of seedZones) {
      const count = zone.slotsPerDay === 2 ? 2 : 3;
      for (let w = 0; w < count; w++) {
        slots.push({
          id: `slot_${date}_${zone.id}_${w}`,
          zoneId: zone.id,
          date,
          window: windows[w] ?? "16:00–18:00",
          capacity: 6,
          booked: d === 0 && w === 0 ? 2 : 0,
        });
      }
    }
  }
  return slots;
}

export const seedCustomers: Customer[] = [
  { id: "cus_001", name: "Akosua Danso (demo)", phone: "+233245550101", email: "akosua.demo@example.com", addressIds: ["addr_001", "addr_002"], isDemo: true, supportNotes: ["Prefers morning delivery slots.", "Second return in a month — watch for pattern (AI exception flag)."], createdAt: isoMinusDays(90) },
  { id: "cus_002", name: "Michael Osei (demo)", phone: "+233205550102", email: "michael.demo@example.com", addressIds: ["addr_003"], isDemo: true, supportNotes: ["Usually orders on Fridays."], createdAt: isoMinusDays(60) },
  { id: "cus_003", name: "Esi Baidoo (demo)", phone: "+233275550103", email: "esi.demo@example.com", addressIds: ["addr_004"], isDemo: true, supportNotes: [], createdAt: isoMinusDays(45) },
];

export const seedAddresses: Address[] = [
  { id: "addr_001", customerId: "cus_001", label: "Home", recipientName: "Akosua Danso", phone: "+233245550101", locality: "Labone", street: "12 Labone Crescent", landmark: "Near Labone Coffee Shop (demo)", ghanaPostGps: "GA-457-2029", zoneId: "zone_c", isDefault: true },
  { id: "addr_002", customerId: "cus_001", label: "Work", recipientName: "Akosua Danso", phone: "+233245550101", locality: "Osu", street: "Off Oxford Street, Block 8", landmark: "Opposite the bookshop (demo)", ghanaPostGps: "GA-118-4472", zoneId: "zone_c" },
  { id: "addr_003", customerId: "cus_002", label: "Home", recipientName: "Michael Osei", phone: "+233205550102", locality: "Madina", street: "5 Madina Estate Road", landmark: "Behind the police station (demo)", ghanaPostGps: "GM-025-7764", zoneId: "zone_e", isDefault: true },
  { id: "addr_004", customerId: "cus_003", label: "Home", recipientName: "Esi Baidoo", phone: "+233275550103", locality: "Weija", street: "Weija Ridge Court, House 21", landmark: "Near the reservoir road (demo)", ghanaPostGps: "GX-384-0067", zoneId: "zone_w", isDefault: true },
];

/* ------------------------------------------------------------------ */
/* Order builder helpers                                               */
/* ------------------------------------------------------------------ */

interface SeedLine {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unit: string;
  quantity: string;
  unitPriceMinor: number;
  allocations?: { lotId: string; quantity: string }[];
  substitutionOfLineId?: string;
}

interface SeedOrderSpec {
  id: string;
  reference: string;
  channel: "online" | "pos";
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  addressId?: string;
  fulfilment: "delivery" | "collection";
  zoneId?: string;
  slotId?: string;
  slotLabel?: string;
  lines: SeedLine[];
  deliveryFeeMinor: number;
  discountMinor?: number;
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  fulfilmentStatus: Order["fulfilmentStatus"];
  deliveryStatus: Order["deliveryStatus"];
  createdAt: string;
  stockConsumedAt?: string;
  events: Order["events"];
  notes?: Order["notes"];
  posSessionId?: string;
  posReceiptNo?: string;
  verificationCode?: string;
}

function buildOrder(spec: SeedOrderSpec): { order: Order; lines: OrderLine[] } {
  const lines: OrderLine[] = spec.lines.map((l, i) => ({
    id: `${spec.id}_l${i + 1}`,
    orderId: spec.id,
    variantId: l.variantId,
    productId: l.productId,
    productName: l.productName,
    variantName: l.variantName,
    unit: l.unit as OrderLine["unit"],
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    lineTotalMinor: l.unitPriceMinor * Number(l.quantity),
    allocations: l.allocations ?? [],
    substitutionOfLineId: l.substitutionOfLineId,
  }));
  const subtotalMinor = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  const discountMinor = spec.discountMinor ?? 0;
  const order: Order = {
    id: spec.id,
    reference: spec.reference,
    channel: spec.channel,
    customerId: spec.customerId,
    customerName: spec.customerName,
    customerPhone: spec.customerPhone,
    customerEmail: spec.customerEmail,
    addressId: spec.addressId,
    fulfilment: spec.fulfilment,
    zoneId: spec.zoneId,
    slotId: spec.slotId,
    slotLabel: spec.slotLabel,
    lines: lines.map((l) => l.id),
    subtotalMinor,
    discountMinor,
    deliveryFeeMinor: spec.deliveryFeeMinor,
    totalMinor: subtotalMinor - discountMinor + spec.deliveryFeeMinor,
    paymentMethod: spec.paymentMethod,
    paymentStatus: spec.paymentStatus,
    fulfilmentStatus: spec.fulfilmentStatus,
    deliveryStatus: spec.deliveryStatus,
    notes: spec.notes ?? [],
    events: spec.events,
    posSessionId: spec.posSessionId,
    posReceiptNo: spec.posReceiptNo,
    stockConsumedAt: spec.stockConsumedAt,
    createdAt: spec.createdAt,
    verificationCode: spec.verificationCode,
  };
  return { order, lines };
}

export function buildOrders(now: Date): { orders: Order[]; orderLines: OrderLine[] } {
  const orders: Order[] = [];
  const orderLines: OrderLine[] = [];
  const push = (spec: SeedOrderSpec) => {
    const built = buildOrder(spec);
    orders.push(built.order);
    orderLines.push(...built.lines);
  };

  /* ord_1001 — delivered online order, Mobile Money paid, partial return resolved */
  push({
    id: "ord_1001", reference: "VG-8Q2M1A", channel: "online", customerId: "cus_001",
    customerName: "Akosua Danso (demo)", customerPhone: "+233245550101", customerEmail: "akosua.demo@example.com",
    addressId: "addr_001", fulfilment: "delivery", zoneId: "zone_c", slotLabel: "08:00–11:00 (2 days ago)",
    deliveryFeeMinor: 1500, paymentMethod: "mobile_money", paymentStatus: "partially_refunded",
    fulfilmentStatus: "delivered", deliveryStatus: "delivered", createdAt: isoMinusDays(2), stockConsumedAt: isoMinusDays(2),
    verificationCode: "7H2K9P",
    lines: [
      { variantId: "var_ric1_5", productId: "prd_ric1", productName: "Perfumed Local Rice", variantName: "5 kg bag", unit: "bag", quantity: "1", unitPriceMinor: 12000, allocations: [{ lotId: "lot_l_ric1_012", quantity: "1" }] },
      { variantId: "var_tom_kg", productId: "prd_tom", productName: "Fresh Tomatoes", variantName: "Per kilogram", unit: "kg", quantity: "2", unitPriceMinor: 1800, allocations: [{ lotId: "lot_l_tom_231", quantity: "2" }] },
      { variantId: "var_egg_30", productId: "prd_egg", productName: "Farm Eggs", variantName: "Pack of 30", unit: "pack", quantity: "1", unitPriceMinor: 4200, allocations: [{ lotId: "lot_l_egg_30", quantity: "1" }] },
      { variantId: "var_yog_500", productId: "prd_yog", productName: "Natural Yoghurt", variantName: "500 g tub", unit: "piece", quantity: "4", unitPriceMinor: 2000, allocations: [{ lotId: "lot_l_yog_500", quantity: "4" }] },
    ],
    events: [
      { at: isoMinusDays(2), actor: "customer", action: "Order placed", toStatus: "awaiting_confirmation" },
      { at: isoMinusDays(2), actor: "stf_kojo", action: "Payment confirmed", fromStatus: "awaiting_confirmation", toStatus: "confirmed" },
      { at: isoMinusDays(2), actor: "stf_kweku", action: "Picking started", fromStatus: "confirmed", toStatus: "picking" },
      { at: isoMinusDays(2), actor: "stf_kweku", action: "Packed", fromStatus: "picking", toStatus: "packed" },
      { at: isoMinusDays(2), actor: "stf_dela", action: "Assigned to rider Yaw Owusu", toStatus: "assigned" },
      { at: isoMinusDays(2), actor: "rdr_yaw", action: "Picked up from store; stock consumed", toStatus: "picked_up" },
      { at: isoMinusDays(1), actor: "rdr_yaw", action: "Delivered (PIN proof)", fromStatus: "out_for_delivery", toStatus: "delivered" },
      { at: isoMinusDays(1), actor: "customer", action: "Return requested for 2 yoghurt tubs" },
      { at: isoMinusDays(1), actor: "stf_serwaa", action: "Partial refund of ₵40.00 approved and completed" },
    ],
    notes: [{ at: isoMinusDays(1), by: "stf_kojo", text: "Customer reported 2 damaged yoghurt tubs; return accepted, refund processed.", internalOnly: false }],
  });

  /* ord_1002 — pending Mobile Money payment with duplicate callbacks, active reservations */
  push({
    id: "ord_1002", reference: "VG-3P7K2D", channel: "online", customerId: "cus_002",
    customerName: "Michael Osei (demo)", customerPhone: "+233205550102", customerEmail: "michael.demo@example.com",
    addressId: "addr_003", fulfilment: "delivery", zoneId: "zone_e", slotLabel: "12:00–15:00 (today)",
    deliveryFeeMinor: 2000, paymentMethod: "mobile_money", paymentStatus: "pending",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", createdAt: isoMinusMinutes(9),
    verificationCode: "K4V9T2",
    lines: [
      { variantId: "var_egg_30", productId: "prd_egg", productName: "Farm Eggs", variantName: "Pack of 30", unit: "pack", quantity: "2", unitPriceMinor: 4200 },
      { variantId: "var_tom_kg", productId: "prd_tom", productName: "Fresh Tomatoes", variantName: "Per kilogram", unit: "kg", quantity: "3", unitPriceMinor: 1800 },
    ],
    events: [
      { at: isoMinusMinutes(9), actor: "customer", action: "Order placed; stock reserved", toStatus: "awaiting_confirmation" },
      { at: isoMinusMinutes(9), actor: "system", action: "Mobile Money payment initiated", toStatus: "pending" },
      { at: isoMinusMinutes(6), actor: "system", action: "Provider callback received (1); outcome pending" },
      { at: isoMinusMinutes(2), actor: "system", action: "Duplicate provider callback received (2); no state change" },
    ],
  });

  /* ord_1003 — cash on delivery, out for delivery, stock consumed at pickup */
  push({
    id: "ord_1003", reference: "VG-9W4N8B", channel: "online", customerId: "cus_003",
    customerName: "Esi Baidoo (demo)", customerPhone: "+233275550103", customerEmail: "esi.demo@example.com",
    addressId: "addr_004", fulfilment: "delivery", zoneId: "zone_w", slotLabel: "16:00–18:00 (today)",
    deliveryFeeMinor: 2500, paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
    fulfilmentStatus: "dispatched", deliveryStatus: "out_for_delivery", createdAt: isoMinusDays(1), stockConsumedAt: isoMinusMinutes(115),
    verificationCode: "B8J3M6",
    lines: [
      { variantId: "var_flr_5", productId: "prd_flr", productName: "Wheat Flour", variantName: "5 kg pack", unit: "pack", quantity: "1", unitPriceMinor: 7500, allocations: [{ lotId: "lot_l_flr5_013", quantity: "1" }] },
      { variantId: "var_gar_kg", productId: "prd_gar", productName: "Fine Gari", variantName: "Per kilogram", unit: "kg", quantity: "3", unitPriceMinor: 1400, allocations: [{ lotId: "lot_l_gar_045", quantity: "3" }] },
      { variantId: "var_sar_125", productId: "prd_sar", productName: "Sardines in Tomato Sauce", variantName: "125 g tin", unit: "piece", quantity: "6", unitPriceMinor: 900, allocations: [{ lotId: "lot_l_sar_125", quantity: "6" }] },
    ],
    events: [
      { at: isoMinusDays(1), actor: "customer", action: "Order placed (cash on delivery); stock reserved" },
      { at: isoMinusDays(1), actor: "stf_kojo", action: "Order confirmed", fromStatus: "awaiting_confirmation", toStatus: "confirmed" },
      { at: isoMinusMinutes(300), actor: "stf_kweku", action: "Picking started", fromStatus: "confirmed", toStatus: "picking" },
      { at: isoMinusMinutes(200), actor: "stf_kweku", action: "Packed", fromStatus: "picking", toStatus: "packed" },
      { at: isoMinusMinutes(150), actor: "stf_dela", action: "Assigned to rider Yaw Owusu", toStatus: "assigned" },
      { at: isoMinusMinutes(115), actor: "rdr_yaw", action: "Picked up from store; stock consumed", toStatus: "picked_up" },
      { at: isoMinusMinutes(30), actor: "rdr_yaw", action: "Out for delivery", toStatus: "out_for_delivery" },
    ],
  });

  /* ord_1004 — collection order, paid, ready for collection (stock not yet consumed) */
  push({
    id: "ord_1004", reference: "VG-6R1S5C", channel: "online", customerId: "cus_002",
    customerName: "Michael Osei (demo)", customerPhone: "+233205550102", customerEmail: "michael.demo@example.com",
    fulfilment: "collection", deliveryFeeMinor: 0, paymentMethod: "mobile_money", paymentStatus: "succeeded",
    fulfilmentStatus: "ready_for_collection", deliveryStatus: "unassigned", createdAt: isoMinusDays(1),
    verificationCode: "C2N7Q4",
    lines: [
      { variantId: "var_wip_80", productId: "prd_wip", productName: "Baby Wipes", variantName: "Pack of 80 wipes", unit: "pack", quantity: "1", unitPriceMinor: 2500 },
      { variantId: "var_cer_400", productId: "prd_cer", productName: "Baby Maize Cereal", variantName: "400 g tin", unit: "piece", quantity: "1", unitPriceMinor: 4500 },
      { variantId: "var_mlk_400", productId: "prd_mlk", productName: "Full Cream Milk Powder", variantName: "400 g tin", unit: "piece", quantity: "1", unitPriceMinor: 3800 },
    ],
    events: [
      { at: isoMinusDays(1), actor: "customer", action: "Collection order placed; stock reserved" },
      { at: isoMinusDays(1), actor: "stf_kojo", action: "Payment confirmed (Mobile Money)", toStatus: "confirmed" },
      { at: isoMinusMinutes(90), actor: "stf_kweku", action: "Packed and moved to collection point", fromStatus: "picking", toStatus: "ready_for_collection" },
    ],
  });

  /* ord_1005 — POS cash sale (yesterday, closed session) */
  push({
    id: "ord_1005", reference: "VG-2T5H7F", channel: "pos",
    customerName: "Walk-in customer", customerPhone: "",
    fulfilment: "collection", deliveryFeeMinor: 0, paymentMethod: "cash_counter", paymentStatus: "succeeded",
    fulfilmentStatus: "collected", deliveryStatus: "unassigned", createdAt: isoMinusDays(1), stockConsumedAt: isoMinusDays(1),
    posSessionId: "cash_01", posReceiptNo: "R-00001",
    lines: [
      { variantId: "var_wat_750", productId: "prd_wat", productName: "Bottled Water", variantName: "750 ml bottle", unit: "piece", quantity: "4", unitPriceMinor: 300, allocations: [{ lotId: "lot_l_wat_750", quantity: "4" }] },
      { variantId: "var_tof_1", productId: "prd_tof", productName: "Toffee Assortment", variantName: "Single toffee", unit: "piece", quantity: "10", unitPriceMinor: 100, allocations: [{ lotId: "lot_l_tof_001", quantity: "10" }] },
      { variantId: "var_plc_100", productId: "prd_plc", productName: "Plantain Chips (Salted)", variantName: "100 g pack", unit: "pack", quantity: "2", unitPriceMinor: 500, allocations: [{ lotId: "lot_l_plc_100", quantity: "2" }] },
    ],
    events: [
      { at: isoMinusDays(1), actor: "stf_adjoa", action: "Counter sale completed (cash); stock consumed", toStatus: "collected" },
    ],
  });

  /* ord_1006 — POS card sale, linked return in quarantine */
  push({
    id: "ord_1006", reference: "VG-5U8J3G", channel: "pos",
    customerName: "Walk-in customer", customerPhone: "",
    fulfilment: "collection", deliveryFeeMinor: 0, paymentMethod: "card_hosted", paymentStatus: "succeeded",
    fulfilmentStatus: "collected", deliveryStatus: "unassigned", createdAt: isoMinusDays(1), stockConsumedAt: isoMinusDays(1),
    posSessionId: "cash_01", posReceiptNo: "R-00002",
    lines: [
      { variantId: "var_tth_130", productId: "prd_tth", productName: "Toothpaste", variantName: "130 g tube", unit: "piece", quantity: "1", unitPriceMinor: 1400, allocations: [{ lotId: "lot_l_tth_130", quantity: "1" }] },
      { variantId: "var_ans_125", productId: "prd_ans", productName: "Antiseptic Soap", variantName: "125 g bar", unit: "piece", quantity: "2", unitPriceMinor: 700, allocations: [{ lotId: "lot_l_ans_125", quantity: "2" }] },
      { variantId: "var_tis_10", productId: "prd_tis", productName: "Toilet Tissue", variantName: "Pack of 10 rolls", unit: "pack", quantity: "1", unitPriceMinor: 4200, allocations: [{ lotId: "lot_l_tis_010", quantity: "1" }] },
    ],
    events: [
      { at: isoMinusDays(1), actor: "stf_adjoa", action: "Counter sale completed (card); stock consumed", toStatus: "collected" },
      { at: isoMinusDays(1), actor: "stf_adjoa", action: "Return started at counter for 1 antiseptic soap bar" },
    ],
  });

  /* ord_1007 — failed card payment, cancelled, reservations released */
  push({
    id: "ord_1007", reference: "VG-4D9L2H", channel: "online", customerId: "cus_002",
    customerName: "Michael Osei (demo)", customerPhone: "+233205550102", customerEmail: "michael.demo@example.com",
    addressId: "addr_003", fulfilment: "delivery", zoneId: "zone_e", deliveryFeeMinor: 2000,
    paymentMethod: "card_hosted", paymentStatus: "failed", fulfilmentStatus: "cancelled", deliveryStatus: "unassigned",
    createdAt: isoMinusDays(1),
    verificationCode: "H9F6B1",
    lines: [
      { variantId: "var_mil_400", productId: "prd_mil", productName: "Milo Cocoa Drink Tin", variantName: "400 g tin", unit: "piece", quantity: "2", unitPriceMinor: 5200 },
    ],
    events: [
      { at: isoMinusDays(1), actor: "customer", action: "Order placed; stock reserved" },
      { at: isoMinusDays(1), actor: "system", action: "Card payment failed (insufficient funds — demo)" },
      { at: isoMinusDays(1), actor: "system", action: "Order cancelled; reservations released", toStatus: "cancelled" },
    ],
  });

  /* ord_1008 — failed delivery then rescheduled (stock consumed at pickup, no phantom restock) */
  push({
    id: "ord_1008", reference: "VG-7G3K9J", channel: "online", customerId: "cus_003",
    customerName: "Esi Baidoo (demo)", customerPhone: "+233275550103", customerEmail: "esi.demo@example.com",
    addressId: "addr_004", fulfilment: "delivery", zoneId: "zone_w", deliveryFeeMinor: 2500,
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched",
    deliveryStatus: "rescheduled", createdAt: isoMinusDays(2), stockConsumedAt: isoMinusDays(1),
    verificationCode: "J5R8T7",
    lines: [
      { variantId: "var_oni_kg", productId: "prd_oni", productName: "Red Onions", variantName: "Per kilogram", unit: "kg", quantity: "2", unitPriceMinor: 2200, allocations: [{ lotId: "lot_l_oni_118", quantity: "2" }] },
      { variantId: "var_geg_kg", productId: "prd_geg", productName: "Garden Eggs", variantName: "Per kilogram", unit: "kg", quantity: "1", unitPriceMinor: 1500, allocations: [{ lotId: "lot_l_geg_077", quantity: "1" }] },
      { variantId: "var_ppe_kg", productId: "prd_ppe", productName: "Fresh Pepper (Tomato Mix)", variantName: "Per kilogram", unit: "kg", quantity: "1", unitPriceMinor: 2400, allocations: [{ lotId: "lot_l_ppe_031", quantity: "1" }] },
    ],
    events: [
      { at: isoMinusDays(2), actor: "customer", action: "Order placed (cash on delivery); stock reserved" },
      { at: isoMinusDays(1), actor: "stf_kojo", action: "Order confirmed", toStatus: "confirmed" },
      { at: isoMinusDays(1), actor: "stf_kweku", action: "Packed", toStatus: "packed" },
      { at: isoMinusDays(1), actor: "rdr_kwabena", action: "Picked up from store; stock consumed", toStatus: "picked_up" },
      { at: isoMinusDays(1), actor: "rdr_kwabena", action: "Delivery failed — customer absent", toStatus: "failed" },
      { at: isoMinusDays(1), actor: "stf_dela", action: "Rescheduled for the next delivery window", toStatus: "rescheduled" },
    ],
    notes: [{ at: isoMinusDays(1), by: "stf_dela", text: "Customer called back after failed attempt; goods are back in store awaiting re-dispatch. Stock is NOT re-added — goods remain allocated to this order.", internalOnly: true }],
  });

  /* ord_1009 — picking now (FEFO allocations visible to the picker) */
  push({
    id: "ord_1009", reference: "VG-1K6V4L", channel: "online", customerId: "cus_001",
    customerName: "Akosua Danso (demo)", customerPhone: "+233245550101", customerEmail: "akosua.demo@example.com",
    addressId: "addr_001", fulfilment: "delivery", zoneId: "zone_c", slotLabel: "12:00–15:00 (today)",
    deliveryFeeMinor: 1500, paymentMethod: "mobile_money", paymentStatus: "succeeded",
    fulfilmentStatus: "picking", deliveryStatus: "unassigned", createdAt: isoMinusMinutes(240),
    verificationCode: "L3Y2W9",
    lines: [
      { variantId: "var_tom_kg", productId: "prd_tom", productName: "Fresh Tomatoes", variantName: "Per kilogram", unit: "kg", quantity: "2", unitPriceMinor: 1800, allocations: [{ lotId: "lot_l_tom_231", quantity: "2" }] },
      { variantId: "var_pla_bn", productId: "prd_pla", productName: "Ripe Plantain", variantName: "Half bunch", unit: "bunch", quantity: "2", unitPriceMinor: 2500, allocations: [{ lotId: "lot_l_pla_092", quantity: "2" }] },
      { variantId: "var_bea_kg", productId: "prd_bea", productName: "Black-eyed Beans", variantName: "Per kilogram", unit: "kg", quantity: "2", unitPriceMinor: 2800, allocations: [{ lotId: "lot_l_bea_021", quantity: "2" }] },
    ],
    events: [
      { at: isoMinusMinutes(240), actor: "customer", action: "Order placed; stock reserved" },
      { at: isoMinusMinutes(230), actor: "stf_kojo", action: "Payment confirmed (Mobile Money)", toStatus: "confirmed" },
      { at: isoMinusMinutes(25), actor: "stf_kweku", action: "Picking started", fromStatus: "confirmed", toStatus: "picking" },
    ],
  });

  /* ord_1010 — awaiting confirmation, paid */
  push({
    id: "ord_1010", reference: "VG-8X2Q6N", channel: "online", customerId: "cus_003",
    customerName: "Esi Baidoo (demo)", customerPhone: "+233275550103", customerEmail: "esi.demo@example.com",
    addressId: "addr_004", fulfilment: "delivery", zoneId: "zone_w", slotLabel: "16:00–18:00 (today)",
    deliveryFeeMinor: 2500, paymentMethod: "mobile_money", paymentStatus: "succeeded",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", createdAt: isoMinusMinutes(35),
    verificationCode: "N7U5C8",
    lines: [
      { variantId: "var_pal_1l", productId: "prd_pal", productName: "Red Palm Oil", variantName: "1 litre", unit: "litre", quantity: "2", unitPriceMinor: 3500 },
      { variantId: "var_tpa_400", productId: "prd_tpa", productName: "Tomato Paste", variantName: "400 g tin", unit: "piece", quantity: "12", unitPriceMinor: 800 },
    ],
    events: [
      { at: isoMinusMinutes(35), actor: "customer", action: "Order placed; stock reserved" },
      { at: isoMinusMinutes(33), actor: "system", action: "Mobile Money payment confirmed", toStatus: "pending" },
    ],
  });

  /* ord_1011 — collection, unpaid, cash at counter on pickup */
  push({
    id: "ord_1011", reference: "VG-3C8D1P", channel: "online", customerId: "cus_001",
    customerName: "Akosua Danso (demo)", customerPhone: "+233245550101", customerEmail: "akosua.demo@example.com",
    fulfilment: "collection", deliveryFeeMinor: 0, paymentMethod: "cash_counter", paymentStatus: "unpaid",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", createdAt: isoMinusMinutes(60),
    verificationCode: "P9B4M3",
    lines: [
      { variantId: "var_org_kg", productId: "prd_org", productName: "Oranges", variantName: "Per kilogram", unit: "kg", quantity: "3", unitPriceMinor: 1200 },
      { variantId: "var_okr_kg", productId: "prd_okr", productName: "Fresh Okro", variantName: "Per kilogram", unit: "kg", quantity: "1", unitPriceMinor: 2000 },
    ],
    events: [
      { at: isoMinusMinutes(60), actor: "customer", action: "Collection order placed; stock reserved; cash at counter" },
    ],
  });

  /* ord_1013 — paid after reservation expired, stock unavailable: requires review */
  push({
    id: "ord_1013", reference: "VG-6M4X2R", channel: "online", customerId: "cus_002",
    customerName: "Michael Osei (demo)", customerPhone: "+233205550102", customerEmail: "michael.demo@example.com",
    addressId: "addr_003", fulfilment: "delivery", zoneId: "zone_e", deliveryFeeMinor: 2000,
    paymentMethod: "mobile_money", paymentStatus: "requires_review", fulfilmentStatus: "awaiting_confirmation",
    deliveryStatus: "unassigned", createdAt: isoMinusMinutes(280),
    verificationCode: "R2K7F5",
    lines: [
      { variantId: "var_dia_m36", productId: "prd_dia", productName: "Baby Diapers (Size M)", variantName: "Size M, pack of 36", unit: "pack", quantity: "2", unitPriceMinor: 9500 },
    ],
    events: [
      { at: isoMinusMinutes(280), actor: "customer", action: "Order placed; stock reserved" },
      { at: isoMinusMinutes(270), actor: "system", action: "Mobile Money payment initiated", toStatus: "pending" },
      { at: isoMinusMinutes(240), actor: "system", action: "Reservation expired; hold released", note: "Payment still pending" },
      { at: isoMinusMinutes(20), actor: "system", action: "Late payment succeeded after reservation expiry", note: "Stock recheck required" },
      { at: isoMinusMinutes(20), actor: "system", action: "Routed to staff review — stock no longer available", toStatus: "requires_review" },
    ],
    notes: [{ at: isoMinusMinutes(20), by: "system", text: "Late payment after reservation expiry. Stock recheck failed — items may have sold. Route to staff review and the cancellation/refund process.", internalOnly: false }],
  });

  /* ord_1014 — delivered with a pending return request */
  push({
    id: "ord_1014", reference: "VG-9S1Z4T", channel: "online", customerId: "cus_002",
    customerName: "Michael Osei (demo)", customerPhone: "+233205550102", customerEmail: "michael.demo@example.com",
    addressId: "addr_003", fulfilment: "delivery", zoneId: "zone_e", deliveryFeeMinor: 2000,
    paymentMethod: "card_hosted", paymentStatus: "succeeded", fulfilmentStatus: "delivered",
    deliveryStatus: "delivered", createdAt: isoMinusDays(3), stockConsumedAt: isoMinusDays(3),
    verificationCode: "T4D8G6",
    lines: [
      { variantId: "var_sar_125", productId: "prd_sar", productName: "Sardines in Tomato Sauce", variantName: "125 g tin", unit: "piece", quantity: "6", unitPriceMinor: 900, allocations: [{ lotId: "lot_l_sar_125", quantity: "6" }] },
      { variantId: "var_cok_pk", productId: "prd_cok", productName: "Cola Soft Drink", variantName: "Pack of 12 bottles", unit: "pack", quantity: "1", unitPriceMinor: 5500, allocations: [{ lotId: "lot_l_cok_pk", quantity: "1" }] },
    ],
    events: [
      { at: isoMinusDays(3), actor: "customer", action: "Order placed; stock reserved" },
      { at: isoMinusDays(3), actor: "stf_kojo", action: "Payment confirmed (card)", toStatus: "confirmed" },
      { at: isoMinusDays(3), actor: "stf_kweku", action: "Packed", toStatus: "packed" },
      { at: isoMinusDays(3), actor: "rdr_abena", action: "Picked up; stock consumed", toStatus: "picked_up" },
      { at: isoMinusDays(2), actor: "rdr_abena", action: "Delivered (PIN proof)", toStatus: "delivered" },
      { at: isoMinusMinutes(300), actor: "customer", action: "Return requested for 3 sardine tins" },
    ],
  });

  /* ord_1015 — packed and paid, awaiting dispatch assignment */
  push({
    id: "ord_1015", reference: "VG-5H7C3V", channel: "online", customerId: "cus_001",
    customerName: "Akosua Danso (demo)", customerPhone: "+233245550101", customerEmail: "akosua.demo@example.com",
    addressId: "addr_002", fulfilment: "delivery", zoneId: "zone_c", slotLabel: "16:00–18:00 (today)",
    deliveryFeeMinor: 1500, paymentMethod: "mobile_money", paymentStatus: "succeeded",
    fulfilmentStatus: "packed", deliveryStatus: "unassigned", createdAt: isoMinusMinutes(150),
    verificationCode: "V6N9J2",
    lines: [
      { variantId: "var_ric1_5", productId: "prd_ric1", productName: "Perfumed Local Rice", variantName: "5 kg bag", unit: "bag", quantity: "1", unitPriceMinor: 12000 },
      { variantId: "var_sun_1l", productId: "prd_sun", productName: "Sunflower Cooking Oil", variantName: "1 litre", unit: "litre", quantity: "1", unitPriceMinor: 4200 },
      { variantId: "var_tpa_pk", productId: "prd_tpa", productName: "Tomato Paste", variantName: "Pack of 12 tins", unit: "pack", quantity: "1", unitPriceMinor: 9000 },
    ],
    events: [
      { at: isoMinusMinutes(150), actor: "customer", action: "Order placed; stock reserved" },
      { at: isoMinusMinutes(148), actor: "stf_kojo", action: "Payment confirmed (Mobile Money)", toStatus: "confirmed" },
      { at: isoMinusMinutes(100), actor: "stf_kweku", action: "Packed", fromStatus: "picking", toStatus: "packed" },
    ],
  });

  return { orders, orderLines };
}

/* ------------------------------------------------------------------ */
/* Reservations, payments, sessions, jobs                              */
/* ------------------------------------------------------------------ */

export function buildReservations(now: Date): Reservation[] {
  const ttl = 30; // configurable reservation window in minutes
  const dayMs = 86_400_000;
  const mk = (id: string, variantId: string, orderId: string, quantity: string, createdAt: Date, expiresAt: Date, opts?: Partial<Reservation>): Reservation => ({
    id, variantId, orderId, quantity, channel: orderId.startsWith("ord_1") && ["ord_1005", "ord_1006"].includes(orderId) ? "pos" : "online",
    createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), ...opts,
  });
  const t = now.getTime();
  return [
    // active holds for open online orders
    mk("res_1002a", "var_egg_30", "ord_1002", "2", new Date(t - 9 * 60_000), new Date(t + (ttl - 9) * 60_000)),
    mk("res_1002b", "var_tom_kg", "ord_1002", "3", new Date(t - 9 * 60_000), new Date(t + (ttl - 9) * 60_000)),
    mk("res_1004a", "var_wip_80", "ord_1004", "1", new Date(t - dayMs), new Date(t + dayMs)),
    mk("res_1004b", "var_cer_400", "ord_1004", "1", new Date(t - dayMs), new Date(t + dayMs)),
    mk("res_1004c", "var_mlk_400", "ord_1004", "1", new Date(t - dayMs), new Date(t + dayMs)),
    mk("res_1009a", "var_tom_kg", "ord_1009", "2", new Date(t - 240 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1009b", "var_pla_bn", "ord_1009", "2", new Date(t - 240 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1009c", "var_bea_kg", "ord_1009", "2", new Date(t - 240 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1010a", "var_pal_1l", "ord_1010", "2", new Date(t - 35 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1010b", "var_tpa_400", "ord_1010", "12", new Date(t - 35 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1011a", "var_org_kg", "ord_1011", "3", new Date(t - 60 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1011b", "var_okr_kg", "ord_1011", "1", new Date(t - 60 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1015a", "var_ric1_5", "ord_1015", "1", new Date(t - 150 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1015b", "var_sun_1l", "ord_1015", "1", new Date(t - 150 * 60_000), new Date(t + 20 * 3600_000)),
    mk("res_1015c", "var_tpa_pk", "ord_1015", "1", new Date(t - 150 * 60_000), new Date(t + 20 * 3600_000)),
    // consumed at dispatch / counter handover (single depletion event)
    mk("res_1001a", "var_ric1_5", "ord_1001", "1", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(2) }),
    mk("res_1001b", "var_tom_kg", "ord_1001", "2", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(2) }),
    mk("res_1001c", "var_egg_30", "ord_1001", "1", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(2) }),
    mk("res_1001d", "var_yog_500", "ord_1001", "4", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(2) }),
    mk("res_1003a", "var_flr_5", "ord_1003", "1", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusMinutes(115) }),
    mk("res_1003b", "var_gar_kg", "ord_1003", "3", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusMinutes(115) }),
    mk("res_1003c", "var_sar_125", "ord_1003", "6", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusMinutes(115) }),
    mk("res_1005a", "var_wat_750", "ord_1005", "4", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1005b", "var_tof_1", "ord_1005", "10", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1005c", "var_plc_100", "ord_1005", "2", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1006a", "var_tth_130", "ord_1006", "1", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1006b", "var_ans_125", "ord_1006", "2", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1006c", "var_tis_10", "ord_1006", "1", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1008a", "var_oni_kg", "ord_1008", "2", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1008b", "var_geg_kg", "ord_1008", "1", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1008c", "var_ppe_kg", "ord_1008", "1", new Date(t - 2 * dayMs), new Date(t - 2 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(1) }),
    mk("res_1014a", "var_sar_125", "ord_1014", "6", new Date(t - 3 * dayMs), new Date(t - 3 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(3) }),
    mk("res_1014b", "var_cok_pk", "ord_1014", "1", new Date(t - 3 * dayMs), new Date(t - 3 * dayMs + ttl * 60_000), { consumedAt: isoMinusDays(3) }),
    // released: cancelled failed-payment order
    mk("res_1007a", "var_mil_400", "ord_1007", "2", new Date(t - dayMs), new Date(t - dayMs + ttl * 60_000), { releasedAt: isoMinusDays(1), releasedReason: "cancelled" }),
    // released: reservation expiry after abandoned checkout (no order)
    mk("res_abandon", "var_egg_30", "ord_none", "1", new Date(t - 120 * 60_000), new Date(t - 90 * 60_000), { releasedAt: isoMinusMinutes(90), releasedReason: "checkout_abandoned" }),
    // released: expired reservation on ord_1013 (late payment scenario)
    mk("res_1013a", "var_dia_m36", "ord_1013", "2", new Date(t - 280 * 60_000), new Date(t - 240 * 60_000), { releasedAt: isoMinusMinutes(240), releasedReason: "expired" }),
  ];
}

export function buildPaymentAttempts(now: Date): PaymentAttempt[] {
  const t = now.getTime();
  const mk = (o: Partial<PaymentAttempt> & Pick<PaymentAttempt, "id" | "orderId" | "method" | "amountMinor" | "status">): PaymentAttempt => ({
    idempotencyKey: `idem_${o.id}`, callbackCount: 0, settlementState: "unsettled", createdAt: new Date(t - 3600_000).toISOString(), ...o,
  });
  return [
    mk({ id: "pay_1001", orderId: "ord_1001", method: "mobile_money", amountMinor: 29300, status: "succeeded", providerRef: "HT-DEMO-88121", settlementState: "reconciled", createdAt: isoMinusDays(2), resolvedAt: isoMinusDays(2) }),
    mk({ id: "pay_1002", orderId: "ord_1002", method: "mobile_money", amountMinor: 16600, status: "pending", callbackCount: 2, createdAt: new Date(t - 9 * 60_000).toISOString(), note: "Two provider callbacks received; outcome still pending. Duplicate callbacks must not double-mark payment." }),
    mk({ id: "pay_1004", orderId: "ord_1004", method: "mobile_money", amountMinor: 10800, status: "succeeded", providerRef: "HT-DEMO-88422", settlementState: "settled", createdAt: isoMinusDays(1), resolvedAt: isoMinusDays(1) }),
    mk({ id: "pay_1005", orderId: "ord_1005", method: "cash_counter", amountMinor: 3200, status: "succeeded", settlementState: "reconciled", note: "Cash taken at counter; counted in session cash_01.", createdAt: isoMinusDays(1), resolvedAt: isoMinusDays(1) }),
    mk({ id: "pay_1006", orderId: "ord_1006", method: "card_hosted", amountMinor: 7000, status: "succeeded", providerRef: "HT-DEMO-88513", settlementState: "settled", createdAt: isoMinusDays(1), resolvedAt: isoMinusDays(1) }),
    mk({ id: "pay_1007", orderId: "ord_1007", method: "card_hosted", amountMinor: 12400, status: "failed", failureReason: "Insufficient funds (demo)", createdAt: isoMinusDays(1), resolvedAt: isoMinusDays(1) }),
    mk({ id: "pay_1009", orderId: "ord_1009", method: "mobile_money", amountMinor: 13100, status: "succeeded", providerRef: "HT-DEMO-88614", settlementState: "settled", createdAt: new Date(t - 230 * 60_000).toISOString(), resolvedAt: new Date(t - 230 * 60_000).toISOString() }),
    mk({ id: "pay_1010", orderId: "ord_1010", method: "mobile_money", amountMinor: 21100, status: "succeeded", providerRef: "HT-DEMO-88715", settlementState: "settled", createdAt: new Date(t - 33 * 60_000).toISOString(), resolvedAt: new Date(t - 33 * 60_000).toISOString() }),
    mk({ id: "pay_1013", orderId: "ord_1013", method: "mobile_money", amountMinor: 21000, status: "succeeded", providerRef: "HT-DEMO-88816", settlementState: "exception", createdAt: new Date(t - 270 * 60_000).toISOString(), resolvedAt: new Date(t - 20 * 60_000).toISOString(), note: "Late success after reservation expiry. Reconciliation required." }),
    mk({ id: "pay_1014", orderId: "ord_1014", method: "card_hosted", amountMinor: 12900, status: "succeeded", providerRef: "HT-DEMO-88917", settlementState: "settled", createdAt: isoMinusDays(3), resolvedAt: isoMinusDays(3) }),
    mk({ id: "pay_1015", orderId: "ord_1015", method: "mobile_money", amountMinor: 26700, status: "succeeded", providerRef: "HT-DEMO-89018", settlementState: "settled", createdAt: new Date(t - 148 * 60_000).toISOString(), resolvedAt: new Date(t - 148 * 60_000).toISOString() }),
  ];
}

export function buildCashierSessions(now: Date): CashierSession[] {
  return [
    {
      id: "cash_01", cashierId: "stf_adjoa", cashierName: "Adjoa Yeboah",
      openedAt: isoMinusDays(1), closedAt: isoMinusDays(1),
      openingFloatMinor: 5000, status: "closed",
      movements: [
        { at: isoMinusDays(1), kind: "cash_out", amountMinor: 500, note: "Float top-up returned to safe" },
      ],
      expectedCashMinor: 7700, countedCashMinor: 7460, differenceMinor: -240,
      closeNote: "Counted short ₵2.40; approved by operations manager (demo).",
    },
    {
      id: "cash_02", cashierId: "stf_adjoa", cashierName: "Adjoa Yeboah",
      openedAt: isoMinusMinutes(120), openingFloatMinor: 10000, status: "open",
      movements: [
        { at: isoMinusMinutes(60), kind: "cash_in", amountMinor: 2000, note: "Cash drop returned from safe" },
      ],
    },
  ];
}

export function buildDeliveryJobs(now: Date): DeliveryJob[] {
  const t = now.getTime();
  return [
    {
      id: "job_5001", orderId: "ord_1003", zoneId: "zone_w", status: "out_for_delivery", riderId: "rdr_yaw",
      assignedAt: new Date(t - 150 * 60_000).toISOString(), addressId: "addr_004",
      instructions: "Call on arrival; gate is on the reservoir road side. Collect ₵196.00 cash.",
      cashToCollectMinor: 19600,
      events: [
        { at: new Date(t - 150 * 60_000).toISOString(), actor: "stf_dela", action: "Assigned to Yaw Owusu" },
        { at: new Date(t - 115 * 60_000).toISOString(), actor: "rdr_yaw", action: "Accepted and picked up from store" },
        { at: new Date(t - 30 * 60_000).toISOString(), actor: "rdr_yaw", action: "Out for delivery" },
      ],
    },
    {
      id: "job_5002", orderId: "ord_1008", zoneId: "zone_w", status: "rescheduled", riderId: "rdr_kwabena",
      assignedAt: isoMinusDays(1), addressId: "addr_004",
      instructions: "Customer was absent on first attempt; try evening window.",
      cashToCollectMinor: 8300, failureReason: "Customer absent at delivery window (demo)",
      rescheduledFor: isoPlusDays(1),
      events: [
        { at: isoMinusDays(1), actor: "stf_dela", action: "Assigned to Kwabena Mensah" },
        { at: isoMinusDays(1), actor: "rdr_kwabena", action: "Picked up; stock consumed" },
        { at: isoMinusDays(1), actor: "rdr_kwabena", action: "Delivery failed — customer absent" },
        { at: isoMinusDays(1), actor: "stf_dela", action: "Rescheduled to next window; goods held for re-dispatch (no stock re-add)" },
      ],
    },
    {
      id: "job_5003", orderId: "ord_1001", zoneId: "zone_c", status: "delivered", riderId: "rdr_yaw",
      assignedAt: isoMinusDays(2), addressId: "addr_001",
      proof: { method: "pin", detail: "PIN verified by customer", at: isoMinusDays(1) },
      events: [
        { at: isoMinusDays(2), actor: "stf_dela", action: "Assigned to Yaw Owusu" },
        { at: isoMinusDays(2), actor: "rdr_yaw", action: "Picked up; stock consumed" },
        { at: isoMinusDays(1), actor: "rdr_yaw", action: "Delivered with PIN proof" },
      ],
    },
    {
      id: "job_5004", orderId: "ord_1014", zoneId: "zone_e", status: "delivered", riderId: "rdr_abena",
      assignedAt: isoMinusDays(3), addressId: "addr_003",
      proof: { method: "signature", detail: "Signature captured on rider device (demo)", at: isoMinusDays(2) },
      events: [
        { at: isoMinusDays(3), actor: "stf_dela", action: "Assigned to Abena Dufie" },
        { at: isoMinusDays(3), actor: "rdr_abena", action: "Picked up; stock consumed" },
        { at: isoMinusDays(2), actor: "rdr_abena", action: "Delivered with signature proof" },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Returns & refunds                                                   */
/* ------------------------------------------------------------------ */

export function buildReturns(now: Date): { returnRequests: ReturnRequest[]; returnLines: ReturnLine[]; refunds: Refund[] } {
  const t = now.getTime();
  const returnRequests: ReturnRequest[] = [];
  const returnLines: ReturnLine[] = [];
  const refunds: Refund[] = [];

  /* ret_2001 — resolved partial return with a successful provider refund */
  returnRequests.push({
    id: "ret_2001", reference: "RTN-2001", orderId: "ord_1001", channel: "online", customerId: "cus_001",
    requestedBy: "customer", lines: ["rl_2001a"], status: "resolved",
    evidenceNote: "Photos of two crushed yoghurt tubs supplied by customer (demo).",
    receivedAt: isoMinusDays(1), inspectedAt: isoMinusDays(1),
    disposition: { kind: "damaged_unsaleable", note: "Tubs damaged in transit — written off, not restocked.", by: "stf_nana", at: isoMinusDays(1) },
    createdAt: isoMinusDays(1),
  });
  returnLines.push({
    id: "rl_2001a", returnId: "ret_2001", orderLineId: "ord_1001_l4", quantity: "2",
    reason: "Damaged in transit", requestedRefundMinor: 4000, approvedRefundMinor: 4000,
  });
  refunds.push({
    id: "ref_3001", returnId: "ret_2001", orderId: "ord_1001", amountMinor: 4000, status: "succeeded",
    method: "mobile_money", reason: "Partial refund — 2 damaged yoghurt tubs",
    requestedBy: "stf_kojo", approvedBy: "stf_serwaa", providerRef: "HT-DEMO-RF-77231",
    providerTransferState: "succeeded", retryCount: 0,
    createdAt: new Date(t - 23 * 3600_000).toISOString(), resolvedAt: isoMinusDays(1),
  });

  /* ret_2002 — new return request awaiting approval */
  returnRequests.push({
    id: "ret_2002", reference: "RTN-2002", orderId: "ord_1014", channel: "online", customerId: "cus_002",
    requestedBy: "customer", lines: ["rl_2002a"], status: "requested",
    evidenceNote: "Customer reports three tins arrived severely dented (demo).",
    createdAt: new Date(t - 300 * 60_000).toISOString(),
  });
  returnLines.push({
    id: "rl_2002a", returnId: "ret_2002", orderLineId: "ord_1014_l1", quantity: "3",
    reason: "Arrived dented", requestedRefundMinor: 2700,
  });
  refunds.push({
    id: "ref_3002", returnId: "ret_2002", orderId: "ord_1014", amountMinor: 2700, status: "awaiting_approval",
    method: "card_hosted", reason: "Refund preview for 3 dented sardine tins",
    requestedBy: "customer", retryCount: 0, createdAt: new Date(t - 300 * 60_000).toISOString(),
  });

  /* ret_2003 — POS return received and inspected; disposition pending (quarantined) */
  returnRequests.push({
    id: "ret_2003", reference: "RTN-2003", orderId: "ord_1006", channel: "pos",
    requestedBy: "staff", lines: ["rl_2003a"], status: "inspected",
    receivedAt: isoMinusDays(1), inspectedAt: isoMinusDays(1),
    evidenceNote: "Counter return: customer says the soap bar crumbled on first use (demo).",
    createdAt: isoMinusDays(1),
  });
  returnLines.push({
    id: "rl_2003a", returnId: "ret_2003", orderLineId: "ord_1006_l2", quantity: "1",
    reason: "Quality complaint", requestedRefundMinor: 700, approvedRefundMinor: 700,
  });
  refunds.push({
    id: "ref_3003", returnId: "ret_2003", orderId: "ord_1006", amountMinor: 700, status: "requires_review",
    method: "manual_recording", reason: "Cash refund recorded manually — pending manager review",
    requestedBy: "stf_adjoa", retryCount: 1,
    createdAt: isoMinusDays(1),
    note: "Manual refund recording requires finance reviewer sign-off. A refund approval is not a completed money transfer.",
  });

  return { returnRequests, returnLines, refunds };
}

/* ------------------------------------------------------------------ */
/* Stocktakes, adjustments, movements                                  */
/* ------------------------------------------------------------------ */

export function buildStocktakes(now: Date): Stocktake[] {
  const t = now.getTime();
  return [
    {
      id: "stk_001", reference: "ST-0011", status: "review", locationId: "loc_store",
      openedAt: new Date(t - 6 * 3600_000).toISOString(), openedBy: "stf_nana",
      lines: [
        { variantId: "var_tom_kg", expectedQty: "62", countedQty: "62", variance: "0", status: "counted" },
        { variantId: "var_oni_kg", expectedQty: "58", countedQty: "58", variance: "0", status: "counted" },
        { variantId: "var_gar_kg", expectedQty: "42", countedQty: "40", variance: "-2", status: "variance" },
        { variantId: "var_ric1_5", expectedQty: "39", status: "uncounted" },
      ],
    },
    {
      id: "stk_000", reference: "ST-0010", status: "closed", locationId: "loc_store",
      openedAt: isoMinusDays(7), closedAt: isoMinusDays(6), openedBy: "stf_nana",
      lines: [
        { variantId: "var_tpa_400", expectedQty: "128", countedQty: "128", variance: "0", status: "counted" },
        { variantId: "var_wat_750", expectedQty: "94", countedQty: "94", variance: "0", status: "counted" },
      ],
    },
  ];
}

export function buildAdjustments(now: Date): StockAdjustment[] {
  const t = now.getTime();
  return [
    {
      id: "adj_001", variantId: "var_shi_330", lotId: "lot_l_shi_b", delta: "-4",
      reason: "wastage", note: "Expired shito lot withdrawn for disposal (demo).",
      status: "approved", requestedBy: "stf_nana", approvedBy: "stf_kojo",
      at: new Date(t - 5 * 3600_000).toISOString(),
    },
    {
      id: "adj_002", variantId: "var_dig_pk", lotId: "lot_l_dig_dmg", delta: "-8",
      reason: "damage", note: "Carton crushed in storage; write-off requested.",
      status: "pending_approval", requestedBy: "stf_nana",
      at: new Date(t - 3 * 3600_000).toISOString(),
    },
  ];
}

export function buildMovements(now: Date): StockMovement[] {
  const t = now.getTime();
  const mk = (o: Partial<StockMovement> & Pick<StockMovement, "id" | "variantId" | "delta" | "reason" | "at">): StockMovement => ({
    locationId: "loc_store", resultingQty: "—", actorId: "stf_nana", ...o,
  });
  return [
    mk({ id: "mov_001", variantId: "var_sun_1l", lotId: "lot_l_sun1_018", delta: "+28", reason: "received", reference: "gr_001", resultingQty: "28", note: "Goods received against PO-0008", at: isoMinusDays(1) }),
    mk({ id: "mov_002", variantId: "var_fml_1l", lotId: "lot_l_fml_a", delta: "+12", reason: "received", reference: "gr_002", resultingQty: "12", at: isoMinusDays(1) }),
    mk({ id: "mov_003", variantId: "var_shi_330", lotId: "lot_l_shi_b", delta: "-4", reason: "wastage", reference: "adj_001", resultingQty: "0", note: "Expired lot disposal", at: new Date(t - 5 * 3600_000).toISOString(), actorId: "stf_nana" }),
    mk({ id: "mov_004", variantId: "var_yog_500", lotId: "lot_l_yog_ret", delta: "+2", reason: "quarantine", reference: "ret_2001", resultingQty: "2", note: "Returned tubs moved to quarantine; not saleable", at: isoMinusDays(1) }),
    mk({ id: "mov_005", variantId: "var_ans_125", delta: "+1", reason: "quarantine", reference: "ret_2003", resultingQty: "1", note: "Counter return awaiting inspection", at: isoMinusDays(1) }),
  ];
}

/* ------------------------------------------------------------------ */
/* Audit & AI                                                          */
/* ------------------------------------------------------------------ */

export function buildAudit(now: Date): AuditEvent[] {
  const t = now.getTime();
  const mk = (o: Partial<AuditEvent> & Pick<AuditEvent, "id" | "at" | "action" | "entity" | "entityId">): AuditEvent => ({
    actorId: "stf_ama", actorName: "Ama Boateng", ...o,
  });
  return [
    mk({ id: "aud_001", at: isoMinusDays(2), actorId: "stf_ama", actorName: "Ama Boateng", action: "catalog.price_change", entity: "ProductVariant", entityId: "var_sun_5l", reason: "Supplier price update (demo)", before: "19000", after: "19500" }),
    mk({ id: "aud_002", at: isoMinusDays(1), actorId: "stf_serwaa", actorName: "Serwaa Owusu", action: "refund.approved", entity: "Refund", entityId: "ref_3001", reason: "Damage in transit, evidence supplied", before: "awaiting_approval", after: "processing" }),
    mk({ id: "aud_003", at: isoMinusDays(1), actorId: "stf_kojo", actorName: "Kojo Asante", action: "cash.session_closed", entity: "CashierSession", entityId: "cash_01", reason: "Daily reconciliation", before: "open", after: "closed" }),
    mk({ id: "aud_004", at: new Date(t - 5 * 3600_000).toISOString(), actorId: "stf_kojo", actorName: "Kojo Asante", action: "inventory.adjustment_approved", entity: "StockAdjustment", entityId: "adj_001", reason: "Expired stock disposal", before: "pending_approval", after: "approved" }),
    mk({ id: "aud_005", at: isoMinusDays(2), actorId: "stf_dela", actorName: "Dela Agbeko", action: "delivery.assigned", entity: "DeliveryJob", entityId: "job_5003", reason: "Zone coverage", before: "unassigned", after: "assigned" }),
    mk({ id: "aud_006", at: new Date(t - 20 * 60_000).toISOString(), actorId: "system", actorName: "System", action: "payment.requires_review", entity: "Order", entityId: "ord_1013", reason: "Late payment after reservation expiry; stock recheck failed", before: "pending", after: "requires_review" }),
  ];
}

export function buildAiSuggestions(now: Date): AISuggestion[] {
  const t = now.getTime();
  const mk = (o: Partial<AISuggestion> & Pick<AISuggestion, "id" | "kind" | "title" | "detail" | "dataPeriod">): AISuggestion => ({
    evidence: [], status: "suggested", requiresRole: ["owner_admin", "operations_manager", "inventory_officer"], createdAt: new Date(t - 45 * 60_000).toISOString(), source: "deterministic_demo", ...o,
  });
  return [
    mk({
      id: "ai_001", kind: "replenishment", title: "Baby Diapers (Size M) may run out within 2 days",
      detail: "2 packs remain on hand with no safety buffer and 4 packs sold in the last 7 days. A purchase-order draft for 12 packs from Ghana Home Stores Distributors is suggested for review. No order will be placed automatically.",
      evidence: ["Stock on hand: 2 packs (lot L-DIA-M36)", "Sold in last 7 days: 4 packs across 2 orders", "Purchase unit: 1 carton = 12 packs"],
      dataPeriod: "Last 7 days of orders (demo fixtures)",
    }),
    mk({
      id: "ai_002", kind: "expiry_promotion", title: "Milo 400 g lot L-MIL-A expires in 5 days — 18 tins",
      detail: "18 tins in an eligible lot expire in 5 days, with 22 tins in a later lot behind them. A reviewable promotion is suggested; nothing is published automatically.",
      evidence: ["Lot L-MIL-A: 18 tins, expiry in 5 days", "Lot L-MIL-B: 22 tins, expiry in 120 days", "Current price: ₵52.00 (compare-at ₵58.00)"],
      dataPeriod: "Current lot data (demo fixtures)",
    }),
    mk({
      id: "ai_003", kind: "dispatch_grouping", title: "Two packed orders fit one Accra Central run",
      detail: "Orders VG-1K6V4L and VG-5H7C3V are both packed for Accra Central with the 12:00–15:00 window. Assigning one available rider to both reduces trips. In-house riders Kwabena/Abena are options; the dispatcher decides.",
      evidence: ["VG-1K6V4L: picking, zone Accra Central, 3 lines", "VG-5H7C3V: packed, zone Accra Central, 3 lines", "Available in-house riders: 1 (others on jobs)"],
      dataPeriod: "Today's fulfilment queue (demo fixtures)",
    }),
    mk({
      id: "ai_004", kind: "operations_explanation", title: "Payment pending on VG-3P7K2D after duplicate callbacks",
      detail: "Two provider callbacks were received for payment attempt pay_1002 with no confirmed outcome. The order stays pending; customers are not asked to pay twice. Staff should wait for the provider's verified status or contact the payment provider.",
      evidence: ["Attempt pay_1002: 2 callbacks, no resolved outcome", "Order created 9 minutes ago", "Reservation holds 2 egg packs and 3 kg tomatoes for 30 minutes"],
      dataPeriod: "Live mock events (demo fixtures)",
    }),
    mk({
      id: "ai_005", kind: "exception_flag", title: "Second return in 8 days from the same customer",
      detail: "Akosua Danso (demo) has returned items on two orders within 8 days (2 yoghurt tubs, then a pending sardine return from a different account at the same phone domain). Unusual pattern — review refund policy application. Flagged for human review only.",
      evidence: ["RTN-2001 resolved 1 day ago", "Customer support note already flags a pattern", "No refunds were auto-issued"],
      dataPeriod: "Last 8 days of returns (demo fixtures)",
    }),
  ];
}
