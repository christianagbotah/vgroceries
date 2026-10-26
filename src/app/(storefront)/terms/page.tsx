import { CmsInfoPage } from "@/components/shared/cms-info-page";
import { getCmsContentPage } from "@/services/server-data";
import type { CmsContentPageView } from "@/services/contracts";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

const fallback: CmsContentPageView = {
  slug: "terms",
  title: "Terms of service",
  intro: "Core shopping, payment and fulfilment terms for the Variety Groceries service.",
  sections: [
    { heading: "Orders and stock", body: "Orders are subject to current availability and price verification. Substitutions require recorded customer permission." },
    { heading: "Prices and totals", body: "Prices are displayed in Ghana cedis. Authoritative totals, fees, discounts and configured tax treatment are calculated by the service at checkout." },
    { heading: "Payment", body: "Electronic payment is confirmed only after a verified provider outcome. Unknown outcomes remain pending or require review rather than being charged again blindly." },
    { heading: "Delivery and collection", body: "Delivery and collection follow configured zones, fees, operating windows and capacity. Failed deliveries may be rescheduled or returned to store under the recorded workflow." },
  ],
};

export default async function TermsPage() {
  const page = await getCmsContentPage("terms").catch(() => fallback);
  return <CmsInfoPage page={page} />;
}
