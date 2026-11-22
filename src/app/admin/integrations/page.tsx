"use client";

import Link from "next/link";
import { useStaff } from "@/features/staff/role-context";
import { Badge } from "@/components/ui/badge";
import { CreditCard, MessageSquareText, Truck, ShieldAlert } from "lucide-react";

const channels = [
  { name: "Payment gateways", icon: CreditCard, providers: ["Hubtel", "Paystack", "Flutterwave"], description: "Accept customer payments, verify transactions, reconcile settlements and handle refunds.", href: "/admin/payments", link: "View payment transactions", note: "Provider credentials and live routing are server-managed. This page cannot safely change them yet. Listing a gateway does not mean it is connected." },
  { name: "SMS gateways", icon: MessageSquareText, providers: ["Hubtel", "Arkesel", "Nalo", "Twilio"], description: "Send order updates, account verification codes and operational alerts through approved senders.", href: "/admin/settings", link: "View business settings", note: "SMS credentials, sender identity and delivery routing are not editable in this dashboard yet. Do not enter API keys in general business settings." },
  { name: "Delivery partners", icon: Truck, providers: ["In-house delivery", "External couriers"], description: "Manage manual delivery and future courier quoting, booking, status and proof-of-delivery integrations.", href: "/admin/providers", link: "View delivery providers", note: "External provider adapters are candidates until independently connected and verified. Existing provider cards are currently read-only." },
];

export default function IntegrationsPage() {
  const { can } = useStaff();
  if (!can("settings.manage")) return <main className="rounded-xl border p-6"><h1 className="text-xl font-semibold">Administrator access required</h1><p className="mt-2 text-sm text-muted-foreground">Only an authorised administrator may review integration configuration.</p></main>;
  return <main className="mx-auto max-w-5xl space-y-5 pb-12">
    <div><h1 className="font-serif text-2xl font-bold">Integrations &amp; providers</h1><p className="mt-1 text-sm text-muted-foreground">A single place to review payment, messaging and delivery integrations. Configuration and activation controls will appear here only after secure backend support and provider tests are ready.</p></div>
    <div className="flex gap-3 rounded-xl border p-4 text-sm"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /><div><strong>Security notice</strong><p className="mt-1 text-muted-foreground">No API keys, passwords or webhook secrets are displayed or accepted here. Payment and SMS routing cannot be switched from this screen yet. Never paste live credentials into support messages or ordinary forms.</p></div></div>
    <div className="grid gap-4 lg:grid-cols-2">{channels.map(({name,icon:Icon,providers,description,href,link,note}) => <section key={name} className="space-y-3 rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><Icon className="size-5 text-primary" aria-hidden /><h2 className="font-semibold">{name}</h2></div><p className="text-sm text-muted-foreground">{description}</p><div className="flex flex-wrap gap-2">{providers.map(provider => <Badge key={provider} variant="outline">{provider}</Badge>)}</div><p className="text-sm text-muted-foreground">{note}</p><Link className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href={href}>{link}</Link></section>)}</div>
    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Planned administrator controls</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Separate payment and SMS provider selection; encrypted secret storage; test/live mode; credential rotation; test connections; webhook verification; audit history; safe activation and rollback; courier configuration and coverage. Provider-specific features will only be enabled after their APIs have been integrated and verified.</p><Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline" href="/admin/guides">Read staff operating guides</Link></section>
  </main>;
}
