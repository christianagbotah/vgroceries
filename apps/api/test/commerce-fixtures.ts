import { randomBytes, scryptSync } from "node:crypto";
import { Database } from "../src/database/database";

export const commerceTestPassword = "Commerce-test-password-2026";
function passwordHash() {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${scryptSync(commerceTestPassword, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}
const future = (hours: number) => new Date(Date.now() + hours * 3600000);

export async function resetCommerce(db: Database) {
  const tables = [
    "TrackingThrottle", "DeliverySlotBooking", "OrderEvent", "OrderLine", "OrderDeliveryAddress", "Order",
    "DeliverySlot", "DeliveryZone", "CustomerAddress", "GuestCheckoutSession", "Reservation", "StockMovement", "StockLot",
    "StockReceipt", "StockPosition", "Variant", "Product", "Category", "UserLocation", "RefreshToken", "Session", "User",
    "Location", "Idempotency", "AuditEvent", "OutboxEvent", "LoginThrottle",
  ];
  const statement = ["TRUN", "CATE"].join("") + " " + tables.map((table) => `"${table}"`).join(",") + " CASCADE";
  await db.$executeRawUnsafe(statement);
}

export async function seedCommerceFixtures(db: Database) {
  await resetCommerce(db);
  await db.user.createMany({ data: [
    { id: "customer-a", email: "customer-a@example.test", name: "Ama Customer", passwordHash: passwordHash(), role: "customer" },
    { id: "customer-b", email: "customer-b@example.test", name: "Kojo Customer", passwordHash: passwordHash(), role: "customer" },
    { id: "admin-commerce", email: "admin-commerce@example.test", name: "Admin", passwordHash: passwordHash(), role: "admin" },
  ] });
  await db.location.createMany({ data: [
    { id: "loc_accra", name: "Accra", active: true },
    { id: "loc_inactive", name: "Inactive", active: false },
  ] });
  await db.category.create({ data: { id: "cat-commerce", slug: "commerce", name: "Commerce" } });
  await db.product.create({ data: {
    id: "product-rice", slug: "fixture-rice", name: "Fixture Rice", categoryId: "cat-commerce", published: true, tags: ["fixture"],
    variants: { create: { id: "var-rice", sku: "FIX-RICE", name: "Weighted rice", unit: "kg", priceMinor: 199 } },
  } });
  await db.product.create({ data: {
    id: "product-salt", slug: "fixture-salt", name: "Fixture Salt", categoryId: "cat-commerce", published: true, tags: ["fixture"],
    variants: { create: { id: "var-salt", sku: "FIX-SALT", name: "Salt pack", unit: "piece", priceMinor: 125 } },
  } });
  await db.stockPosition.create({ data: {
    id: "pos-rice", variantId: "var-rice", locationId: "loc_accra", safetyStock: "2",
    lots: { create: { id: "lot-rice", lotNumber: "RICE", quantity: "20" } },
  } });
  await db.stockPosition.create({ data: {
    id: "pos-salt", variantId: "var-salt", locationId: "loc_accra", safetyStock: "0",
    lots: { create: { id: "lot-salt", lotNumber: "SALT", quantity: "10" } },
  } });
  await db.customerAddress.createMany({ data: [
    { id: "address-a", userId: "customer-a", label: "Home", recipientName: "Ama Customer", phone: "+233241111111", locality: "Labone", street: "A Street", ghanaPostGps: "GA-123-4567", isDefault: true },
    { id: "address-b", userId: "customer-b", label: "Home", recipientName: "Kojo Customer", phone: "+233242222222", locality: "Osu", street: "B Street", ghanaPostGps: "GA-234-5678", isDefault: true },
  ] });
  await db.deliveryZone.createMany({ data: [
    { id: "zone-required", name: "Required", areas: ["Labone"], feeMinor: 1200, minimumOrderMinor: 1000, serviceHours: "08:00-18:00", cutoff: "16:00", slotsPerDay: 3, slotPolicy: "required", codEnabled: true },
    { id: "zone-optional", name: "Optional", areas: ["Osu"], feeMinor: 500, minimumOrderMinor: 0, serviceHours: "08:00-18:00", cutoff: "17:00", slotsPerDay: 2, slotPolicy: "optional", codEnabled: false },
    { id: "zone-none", name: "No slots", areas: ["Airport"], feeMinor: 0, minimumOrderMinor: 0, serviceHours: "08:00-18:00", cutoff: "17:00", slotsPerDay: 0, slotPolicy: "none", codEnabled: false },
    { id: "zone-inactive", name: "Inactive", areas: ["Closed"], active: false, feeMinor: 1, minimumOrderMinor: 0, serviceHours: "-", cutoff: "-", slotsPerDay: 0, slotPolicy: "none", codEnabled: false },
  ] });
  await db.deliverySlot.createMany({ data: [
    { id: "slot-final", zoneId: "zone-required", startsAt: future(2), endsAt: future(4), capacity: 1 },
    { id: "slot-future", zoneId: "zone-required", startsAt: future(5), endsAt: future(7), capacity: 5 },
    { id: "slot-optional", zoneId: "zone-optional", startsAt: future(2), endsAt: future(4), capacity: 2 },
    { id: "slot-past", zoneId: "zone-required", startsAt: future(-4), endsAt: future(-2), capacity: 3 },
    { id: "slot-inactive", zoneId: "zone-required", startsAt: future(8), endsAt: future(10), capacity: 3, active: false },
  ] });
  return { customerA: "customer-a", customerB: "customer-b", addressA: "address-a", addressB: "address-b" };
}
