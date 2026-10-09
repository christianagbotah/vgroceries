import { InfoPageShell, InfoSection } from "@/components/shared/info-page-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <InfoPageShell
      title="Privacy notice"
      intro="Draft wording for the owner to review with their advisors before launch. Demo data only — no real personal data is collected by this prototype."
    >
      <InfoSection title="What we would collect">
        <p>
          Contact details (name, phone, email), delivery addresses including optional GhanaPostGPS
          codes, order history and support notes — only as needed to fulfil orders and provide
          support. Payment card details are never stored by our storefront; payment providers
          handle them on their own secure pages.
        </p>
      </InfoSection>
      <InfoSection title="How it is used">
        <p>
          Order fulfilment, delivery, returns and refunds, service notifications, and fraud
          prevention. Marketing messages only with your consent, with opt-out at any time.
        </p>
      </InfoSection>
      <InfoSection title="Sharing">
        <p>
          Delivery partners receive only what they need to deliver (name, address, phone). Payment
          providers receive transaction data under their own terms. We do not sell personal data.
        </p>
      </InfoSection>
      <InfoSection title="Your rights">
        <p>
          Access, correction, deletion, and portability of your data, subject to legal retention
          duties (for example tax records). Contact the owner once live channels are published.
        </p>
      </InfoSection>
    </InfoPageShell>
  );
}
