import { CmsInfoPage } from "@/components/shared/cms-info-page";
import { getCmsContentPage } from "@/services/server-data";
import type { CmsContentPageView } from "@/services/contracts";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Returns policy" };

const fallback: CmsContentPageView = {
  slug: "returns-policy",
  title: "Returns & refunds policy",
  intro: "A draft framework for returns, inspection, refunds and exchanges.",
  sections: [
    { heading: "What can be returned", body: "Eligible online and counter-order items can be returned in part or in full. Returned quantities can never exceed the quantities originally purchased." },
    { heading: "Condition and inspection", body: "Returned goods are inspected before restock. Damaged, expired or unsafe items remain unsaleable, while uncertain items stay quarantined until a disposition is recorded." },
    { heading: "Refunds", body: "Refund previews use original paid amounts. Approval is not the same as completed money movement; the final status follows the provider or controlled manual-refund outcome." },
    { heading: "Exchanges", body: "An exchange is recorded as a traceable return plus a new linked sale so the original transaction history is preserved." },
  ],
};

export default async function ReturnsPolicyPage() {
  const page = await getCmsContentPage("returns-policy").catch(() => fallback);
  return <CmsInfoPage page={page} />;
}
