import Link from "next/link";
import { CmsInfoPage } from "@/components/shared/cms-info-page";
import { getCmsContentPage } from "@/services/server-data";
import type { CmsContentPageView } from "@/services/contracts";
import { MapPin, Package, RotateCcw, Truck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help centre" };

const fallback: CmsContentPageView = {
  slug: "help",
  title: "Help centre",
  intro: "Answers to common questions about shopping, delivery, returns and payments.",
  sections: [
    { heading: "Which payment methods can I use?", body: "Electronic checkout and payment on delivery are supported by the configured payment flow. Provider outcomes must be verified before an order is marked paid." },
    { heading: "Why are some items hidden?", body: "We only show goods that are available to sell right now. Sold-out or fully reserved items stay unavailable until sellable stock returns." },
    { heading: "How does stock reservation work?", body: "Adding to your cart does not reserve stock. Checkout creates a time-limited reservation which is released if the order is cancelled or the reservation expires." },
    { heading: "Do I need an account?", body: "No. Guest checkout is supported. An account helps with repeat shopping, saved addresses and return tracking." },
  ],
};

export default async function HelpPage() {
  const page = await getCmsContentPage("help").catch(() => fallback);
  return (
    <CmsInfoPage page={page}>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/delivery", icon: Truck, title: "Delivery information", copy: "Zones, fees, slots and fulfilment options" },
          { href: "/returns-policy", icon: RotateCcw, title: "Returns & refunds", copy: "Return, inspection and refund information" },
          { href: "/track", icon: Package, title: "Track an order", copy: "Use your reference and verification code" },
          { href: "/account/orders", icon: MapPin, title: "Your orders", copy: "History, repeats and eligible cancellations" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent">
            <p className="flex items-center gap-2 font-semibold"><item.icon className="size-5 text-primary" aria-hidden /> {item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.copy}</p>
          </Link>
        ))}
      </div>
    </CmsInfoPage>
  );
}
