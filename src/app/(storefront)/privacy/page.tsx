import { CmsInfoPage } from "@/components/shared/cms-info-page";
import { getCmsContentPage } from "@/services/server-data";
import type { CmsContentPageView } from "@/services/contracts";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

const fallback: CmsContentPageView = {
  slug: "privacy",
  title: "Privacy notice",
  intro: "How Variety Groceries handles customer and order information.",
  sections: [
    { heading: "What we collect", body: "Contact details, delivery addresses, order history and support information are collected only as needed to operate orders and support. Card details are not stored by the storefront." },
    { heading: "How it is used", body: "Information supports order fulfilment, delivery, returns, refunds, service notifications and legitimate fraud prevention." },
    { heading: "Sharing", body: "Delivery and payment providers receive only the information needed for their role. Variety Groceries does not sell customer personal data." },
    { heading: "Your choices", body: "Customers can request appropriate access or correction once production support channels and retention rules are finalized." },
  ],
};

export default async function PrivacyPage() {
  const page = await getCmsContentPage("privacy").catch(() => fallback);
  return <CmsInfoPage page={page} />;
}
