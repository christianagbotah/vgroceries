"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Search } from "lucide-react";

type Topic = { title: string; url: string; audience: string; steps: string[]; status?: string };
type Section = { name: string; topics: Topic[] };
const sections: Section[] = [
  { name: "Customer storefront", topics: [
    { title: "Browse groceries", url: "/", audience: "Customer", steps: ["Open the storefront.", "Browse categories and product cards.", "Check the current price, quantity and availability before adding to cart."] },
    { title: "Categories", url: "/categories", audience: "Customer", steps: ["Open Categories.", "Choose a category to narrow the catalogue.", "Open a product to review its details."] },
    { title: "Shopping cart", url: "/cart", audience: "Customer", steps: ["Review selected products and quantities.", "Remove unwanted items or adjust quantities.", "Proceed to checkout when the order is correct."] },
    { title: "Checkout", url: "/checkout", audience: "Customer", steps: ["Confirm the order summary and fulfilment information.", "Select an available payment method.", "Wait for verified payment confirmation; do not assume an interrupted payment succeeded."] },
    { title: "Customer sign-in", url: "/account/login", audience: "Customer", steps: ["Enter your account credentials.", "Use the password visibility control if needed.", "Sign in to manage your customer account."] },
    { title: "Order tracking", url: "/track", audience: "Customer", steps: ["Open the tracking page.", "Enter the requested order reference and verification details.", "Read the current order status."] },
    { title: "Customer help", url: "/help", audience: "Customer", steps: ["Open Help.", "Review available guidance and support options."] },
  ] },
  { name: "Catalogue and stock", topics: [
    { title: "Products and pricing", url: "/admin/products", audience: "Admin / operations", steps: ["Open Products and find the relevant item.", "Edit the permitted product fields.", "Preview price changes and provide a reason where required before saving."] },
    { title: "Categories management", url: "/admin/categories", audience: "Admin / operations", steps: ["Review category records.", "Make authorised catalogue changes.", "Check the public category view afterwards."] },
    { title: "Inventory", url: "/admin/inventory", audience: "Inventory officer", steps: ["Review stock and exceptions.", "Record receiving, counts and adjustments through the available workflow.", "Investigate discrepancies before making corrections."] },
    { title: "Suppliers", url: "/admin/suppliers", audience: "Purchasing", steps: ["Review supplier records.", "Maintain approved supplier details.", "Verify changes before placing orders."] },
    { title: "Purchases", url: "/admin/purchases", audience: "Purchasing", steps: ["Review purchase records.", "Follow approval and receiving steps where available.", "Reconcile received goods against the purchase record."] },
  ] },
  { name: "Sales and fulfilment", topics: [
    { title: "Orders", url: "/admin/orders", audience: "Operations", steps: ["Review incoming orders and their status.", "Open an order for item and fulfilment details.", "Record authorised status changes."] },
    { title: "Point of sale", url: "/admin/pos", audience: "Cashier", steps: ["Sign in with your assigned staff account.", "Follow the available POS sale and payment workflow.", "Issue receipts and reconcile the cash session."] },
    { title: "Fulfilment", url: "/admin/fulfilment", audience: "Picker / packer", steps: ["Review work awaiting fulfilment.", "Check quantities and item identity.", "Record exceptions and handover using the system workflow."] },
    { title: "Dispatch", url: "/admin/dispatch", audience: "Dispatcher", steps: ["Review orders ready for dispatch.", "Coordinate authorised assignments.", "Track exceptions and proof of delivery."] },
    { title: "Delivery providers", url: "/admin/providers", audience: "Administrator", status: "Provider add/edit and external courier API configuration are not available in the current dashboard.", steps: ["Review the existing provider cards.", "Use Integrations to see supported and planned provider types.", "Do not treat a listed provider as a connected courier."] },
  ] },
  { name: "Payments, returns and finance", topics: [
    { title: "Payments", url: "/admin/payments", audience: "Finance", steps: ["Review payment attempts and statuses.", "Reconcile unresolved transactions against verified provider records.", "Do not manually confirm an unverified payment."] },
    { title: "Refunds", url: "/admin/refunds", audience: "Finance", steps: ["Review the refund request and evidence.", "Follow approval and provider-verification steps.", "Record the final outcome without duplicate processing."] },
    { title: "Returns", url: "/admin/returns", audience: "Operations", steps: ["Review the return request.", "Inspect the returned items and condition.", "Follow the authorised restock or refund process."] },
    { title: "Reports", url: "/admin/reports", audience: "Manager / finance", steps: ["Choose the relevant report.", "Review dates, filters and totals.", "Reconcile any financial figures against source records."] },
  ] },
  { name: "Administration and security", topics: [
    { title: "Administration dashboard", url: "/admin", audience: "Staff", steps: ["Sign in using your own authorised account.", "Review dashboard alerts and operational queues.", "Use the navigation menu to open your permitted modules."] },
    { title: "Team and roles", url: "/admin/team", audience: "Administrator", status: "Custom role creation and a dynamic permission editor are not yet available.", steps: ["Review predefined staff roles.", "Use verified staff onboarding only where enabled.", "Read role operating guides before assigning responsibilities."] },
    { title: "Role operating guides", url: "/admin/guides", audience: "All staff", steps: ["Select a staff role.", "Read its daily workflow and cautions.", "Review the frontend permission reference; backend authorisation is authoritative."] },
    { title: "Integrations and providers", url: "/admin/integrations", audience: "Administrator", status: "Payment/SMS credential editors and live gateway switching are not implemented.", steps: ["Review payment, SMS and delivery integration categories.", "Check the configuration status notices.", "Keep API keys out of general settings and support messages."] },
    { title: "Business settings", url: "/admin/settings", audience: "Administrator", steps: ["Review business and fulfilment configuration.", "Save only authorised changes.", "Use the Integrations page for gateway readiness information."] },
    { title: "Audit history", url: "/admin/audit", audience: "Administrator", steps: ["Review recorded administrative activity.", "Investigate unexpected changes.", "Preserve audit evidence when escalating incidents."] },
  ] },
];

export default function SystemManualPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("Administration dashboard");
  const topics = useMemo(() => sections.flatMap(s => s.topics), []);
  const topic = topics.find(t => t.title === selected) ?? topics[0];
  return <main className="mx-auto max-w-7xl space-y-5 pb-12">
    <header className="space-y-2"><div className="flex items-center gap-2"><BookOpen className="size-6 text-primary"/><h1 className="font-serif text-2xl font-bold">Variety Groceries system manual</h1></div><p className="text-sm text-muted-foreground">Interactive, navigable guide to the storefront and staff operations. Open the actual application page from each topic. Screens and features not yet implemented are identified explicitly.</p></header>
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border bg-card p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" aria-label="Manual contents">
        <label className="flex items-center gap-2 rounded-md border px-3"><Search className="size-4 shrink-0 text-muted-foreground"/><input className="min-h-11 min-w-0 w-full bg-transparent text-sm outline-none" placeholder="Search the manual" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search manual topics"/></label>
        <nav className="mt-3 space-y-4">{sections.map(section => { const matches=section.topics.filter(t => (section.name+" "+t.title+" "+t.audience).toLowerCase().includes(search.toLowerCase())); return matches.length ? <div key={section.name}><h2 className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.name}</h2><div className="space-y-1">{matches.map(t=><button type="button" key={t.title} onClick={()=>setSelected(t.title)} aria-current={selected===t.title?"page":undefined} className={`block min-h-10 w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${selected===t.title?"bg-primary/10 font-semibold text-primary":""}`}>{t.title}</button>)}</div></div>:null})}</nav>
      </aside>
      <article className="min-w-0 space-y-5 rounded-xl border bg-card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{topic.audience}</p><h2 className="mt-1 text-xl font-bold">{topic.title}</h2></div><Link href={topic.url} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open actual page <ExternalLink className="size-4"/></Link></div>
        {topic.status && <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><strong>Implementation limitation:</strong> {topic.status}</div>}
        <section><h3 className="font-semibold">Step-by-step operating procedure</h3><ol className="mt-3 list-decimal space-y-3 pl-6 text-sm leading-6">{topic.steps.map(step=><li key={step}>{step}</li>)}</ol></section>
        <section className="rounded-lg border bg-muted/30 p-4 text-sm"><h3 className="font-semibold">Graphical walkthrough</h3><p className="mt-1 text-muted-foreground">Use “Open actual page” to view the current live screen. Verified, annotated screenshots for each page and mobile view are being prepared; this manual does not substitute invented screenshots for real application views.</p></section>
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">{topics.indexOf(topic)>0 && <button className="min-h-11 rounded-md border px-4 text-sm" onClick={()=>setSelected(topics[topics.indexOf(topic)-1].title)}>Previous topic</button>}{topics.indexOf(topic)<topics.length-1 && <button className="ml-auto min-h-11 rounded-md border px-4 text-sm" onClick={()=>setSelected(topics[topics.indexOf(topic)+1].title)}>Next topic</button>}</div>
      </article>
    </div>
  </main>;
}
