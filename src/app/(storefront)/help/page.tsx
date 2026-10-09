import Link from "next/link";
import { InfoPageShell, InfoSection } from "@/components/shared/info-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Package, RotateCcw, Truck, CircleHelp } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help centre" };

export default function HelpPage() {
  return (
    <InfoPageShell
      title="Help centre"
      intro="Answers to common questions about shopping, delivery, returns and payments. This content is owner-editable before launch."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/delivery", icon: Truck, title: "Delivery information", copy: "Zones, fees, slots and cash on delivery" },
          { href: "/returns-policy", icon: RotateCcw, title: "Returns & refunds", copy: "How requests, inspections and refunds work" },
          { href: "/track", icon: Package, title: "Track an order", copy: "Use your reference and code" },
          { href: "/account/orders", icon: MapPin, title: "Your orders", copy: "History, repeats and cancellations" },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent">
            <p className="flex items-center gap-2 font-semibold">
              <c.icon className="size-5 text-primary" aria-hidden /> {c.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{c.copy}</p>
          </Link>
        ))}
      </div>

      <InfoSection title="Which payment methods can I use?">
        <p>
          <strong>Mobile Money, hosted card checkout, verified bank transfer, cash at the counter,
          and cash on delivery.</strong> In this prototype no payment provider is connected — no
          real money moves. In production, payment outcomes are always verified by our backend
          before an order is marked paid; a screenshot or browser redirect never counts.
        </p>
      </InfoSection>

      <InfoSection title="Why are some items hidden?">
        <p>
          We only show goods that are available to sell right now. When stock is reserved by other
          customers or sold out, the item disappears from lists, search and recommendations until
          it is available again. A saved link shows a clear &ldquo;unavailable&rdquo; state with
          purchasing disabled.
        </p>
      </InfoSection>

      <InfoSection title="How does stock reservation work?">
        <p>
          Adding to your cart does not reserve anything. Once you place an order, the items are
          reserved for a short window (currently 30 minutes) while payment completes. If payment
          does not complete in time, the hold is released automatically — you never lose money.
        </p>
      </InfoSection>

      <InfoSection title="Do I need an account?">
        <p>
          No — guest checkout is fully supported. An account makes repeat shopping, saved addresses
          and return tracking easier. Orders placed as a guest can always be tracked with the
          reference and code from checkout.
        </p>
      </InfoSection>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleHelp className="size-5 text-primary" aria-hidden /> Still need help?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Call or WhatsApp <strong className="text-foreground">+233 30 000 0000 (demo)</strong> or
            email <strong className="text-foreground">support@varietygrocery.com (demo inbox)</strong>.
            Contact channels are placeholders until the owner configures them.
          </p>
        </CardContent>
      </Card>
    </InfoPageShell>
  );
}
