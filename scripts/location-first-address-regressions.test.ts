import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { guestAddressInputSchema } from "../packages/contracts/src/validation";

const read = (path: string) => readFileSync(path, "utf8");

describe("location-first delivery address", () => {
  test("checkout contracts and persistence carry coordinates", () => {
    const contract = read("packages/contracts/src/checkout.ts");
    const schema = read("apps/api/prisma/schema.prisma");
    expect(contract).toContain("latitude?: number");
    expect(contract).toContain("longitude?: number");
    expect(contract).toContain('locationSource?: "device_gps" | "map_pin"');
    expect(schema).toContain("latitude Decimal?");
    expect(schema).toContain("longitude Decimal?");
    expect(schema).toContain("locationSource String?");
    expect(existsSync("apps/api/prisma/migrations/202610240015_location_first_delivery_address/migration.sql")).toBe(true);
  });

  test("server accepts coordinates as a valid location anchor and snapshots them", () => {
    const values = read("apps/api/src/orders/checkout.values.ts");
    const command = read("apps/api/src/orders/checkout-command.service.ts");
    expect(values).toContain("validCoordinates");
    expect(values).toContain("A delivery location or descriptive address is required.");
    expect(command).toMatch(/latitude:\s*address\.latitude/);
    expect(command).toMatch(/longitude:\s*address\.longitude/);
    expect(command).toMatch(/locationSource:\s*address\.locationSource/);
  });

  test("client validation accepts a coordinate-only location anchor", () => {
    const parsed = guestAddressInputSchema.safeParse({
      recipientName: "Ama Customer",
      phone: "+233241234567",
      latitude: 5.603717,
      longitude: -0.186964,
      locationSource: "device_gps",
    });
    expect(parsed.success).toBe(true);
    expect(guestAddressInputSchema.safeParse({
      recipientName: "Ama Customer",
      phone: "+233241234567",
      latitude: 5.603717,
      locationSource: "device_gps",
    }).success).toBe(false);
  });

  test("storefront can capture the customer's current location with explicit consent", () => {
    const checkout = read("src/app/(storefront)/checkout/page.tsx");
    expect(checkout).toContain("Use my current location");
    expect(checkout).toContain("navigator.geolocation.getCurrentPosition");
    expect(checkout).toContain("latitude");
    expect(checkout).toContain("longitude");
    expect(checkout).toMatch(/locationSource:.*"device_gps"/);
  });

  test("a pin or GhanaPostGPS anchor does not force customers to complete optional written directions", () => {
    const checkout = read("src/app/(storefront)/checkout/page.tsx");
    expect(checkout).toContain("if (!hasCoordinates && !hasGhanaPostGps && Boolean(locality.trim()) !== Boolean(street.trim()))");
  });
});
