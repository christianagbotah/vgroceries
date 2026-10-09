import { InfoPageShell, InfoSection } from "@/components/shared/info-page-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <InfoPageShell
      title="Terms of service"
      intro="A starting draft for the owner and their legal advisors. Nothing here is legal advice."
    >
      <InfoSection title="Orders and stock">
        <p>
          Placing an order reserves stock for a limited window pending payment confirmation. We
          only sell what is available; if stock or a price changes before confirmation, we will
          contact you rather than substitute silently. Substitutions require your permission.
        </p>
      </InfoSection>
      <InfoSection title="Prices and taxes">
        <p>
          All prices are in Ghana cedis (₵). Authoritative totals — including fees, discounts and
          any applicable tax treatment — are calculated at checkout by our service. Tax treatment is
          configured by the owner before launch.
        </p>
      </InfoSection>
      <InfoSection title="Payment">
        <p>
          Electronic payments are confirmed only via verified provider outcomes; pending states are
          reconciled rather than double-charged. Cash on delivery is collected by the rider and
          remitted to the store.
        </p>
      </InfoSection>
      <InfoSection title="Delivery">
        <p>
          Delivery is offered per published zone with fees, minimums, hours and slot capacity.
          Failed attempts can be rescheduled or returned to store; goods must pass inspection
          before any restock or resale.
        </p>
      </InfoSection>
      <InfoSection title="Prototype notice">
        <p>
          This storefront is a frontend prototype with fictional demo data. No real payments,
          deliveries, or customer accounts exist yet.
        </p>
      </InfoSection>
    </InfoPageShell>
  );
}
