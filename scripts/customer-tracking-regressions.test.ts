import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

test("customer tracking shares one safe journey component across all three order surfaces", () => {
  const component = read("src/components/orders/order-tracking-journey.tsx");
  for (const screen of [
    "src/app/(storefront)/track/page.tsx",
    "src/app/(storefront)/checkout/status/[id]/page.tsx",
    "src/app/(storefront)/account/orders/[id]/page.tsx",
  ]) {
    const page = read(screen);
    expect(page).toContain('import { OrderTrackingJourney }');
    expect(page).toContain("<OrderTrackingJourney order={order}");
  }
  expect(component).toContain("order.trackingJourney");
  expect(component).toContain("order.events.map");
  expect(component).toContain("Planned · not yet confirmed");
  expect(component).toContain('step.status !== "planned"');
  expect(component).toContain("journey.currentLocationLabel");
  expect(component).toContain("aria-live");
  expect(component).not.toContain("routeRuleId");
  expect(component).not.toContain("safeMetadata");
  expect(component).not.toContain("latitude");
  expect(component).not.toContain("longitude");
});

test("verified guest refresh repeats its verified lookup and account refresh retains owner session", () => {
  const screen = read("src/app/(storefront)/track/page.tsx");
  expect(screen).toContain("verifiedLookup");
  expect(screen).toContain("apiOps.track(verifiedLookup!.reference, verifiedLookup!.code)");
  expect(screen).toContain("apiOps.orderStatus(orderId)");
  expect(screen).toContain("window.setInterval");
  expect(screen).toContain("30000");
  expect(screen).toContain('"delivered", "collected"');
  expect(screen).toContain("order.fulfilmentStatus === \"cancelled\"");
  expect(screen).toContain("onRefresh={refresh}");
  expect(screen).not.toContain("code: encodeURIComponent");
});

test("journey times are only shown for committed, non-planned milestones", () => {
  const component = read("src/components/orders/order-tracking-journey.tsx");
  expect(component).toContain('step.status !== "planned" ? <time');
  expect(component).toContain("Only confirmed updates are shown");
  expect(component).toContain('aria-label="Refresh order journey"');
});
