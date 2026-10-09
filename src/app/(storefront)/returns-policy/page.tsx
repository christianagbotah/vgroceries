import { InfoPageShell, InfoSection } from "@/components/shared/info-page-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Returns policy" };

export default function ReturnsPolicyPage() {
  return (
    <InfoPageShell
      title="Returns & refunds policy"
      intro="A draft framework the owner can edit. It reflects how the demo workflows behave so nothing here contradicts the product."
    >
      <InfoSection title="What can be returned">
        <p>
          Online and counter orders can be returned in part or in full after delivery or
          collection. Select the items, quantities and a reason in your account, or ask at the
          counter with your receipt. The eligible balance is tracked per item — you can never
          return more than you originally bought on that order line.
        </p>
      </InfoSection>
      <InfoSection title="Condition and inspection">
        <p>
          Returned goods are received at the store and inspected before any restock. Damaged,
          expired or unsafe items are never resold; goods needing a second look stay in quarantine
          until a decision is recorded.
        </p>
      </InfoSection>
      <InfoSection title="Refunds">
        <p>
          Refund previews use the original paid amounts. Requests go through approval, then
          execution via the original payment method where possible. A refund request or approval is
          not yet a completed money transfer — the recorded status reflects the provider result.
          Manual cash refunds are recorded distinctly and require a finance sign-off.
        </p>
      </InfoSection>
      <InfoSection title="Exchanges">
        <p>
          An exchange is handled as a traceable return plus a new linked order, with any price
          difference settled transparently. Original sale history is never overwritten.
        </p>
      </InfoSection>
      <InfoSection title="Policy limits">
        <p>
          Final windows, exclusions (for example chilled and frozen goods), and any restocking
          charges are owner decisions to be confirmed before launch. This page will be updated with
          the approved policy.
        </p>
      </InfoSection>
    </InfoPageShell>
  );
}
