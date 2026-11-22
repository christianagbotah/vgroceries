"use client";

import Link from "next/link";
import { useState } from "react";
import { PERMISSIONS } from "@/lib/perms";
import { ROLE_LABELS } from "@/types/domain";
import type { StaffRole } from "@/types/domain";

const guides: Partial<Record<StaffRole, { purpose: string; steps: string[]; caution: string }>> = {
  owner_admin: { purpose: "Oversee the store, permissions, money, fulfilment and audit activity.", steps: ["Review the dashboard and orders awaiting confirmation.", "Manage catalogue and prices under Products; document price-change reasons.", "Monitor stock, purchasing, dispatch, refunds and payment reconciliation.", "Review team access and audit events; do not share administrator credentials."], caution: "Payment and SMS credentials are still managed server-side; there is no secure self-service integration editor yet." },
  operations_manager: { purpose: "Coordinate orders, picking, packing, inventory receiving and dispatch.", steps: ["Review new orders and confirm fulfilment requirements.", "Assign picking and packing; manage substitutions with an audit trail.", "Coordinate dispatch or collection and resolve customer service exceptions.", "Update catalogue pricing only where authorised."], caution: "Do not approve refunds or modify financial settings without the appropriate authority." },
  inventory_officer: { purpose: "Keep sellable stock accurate, safe and traceable.", steps: ["Check low-stock and expiry alerts.", "Record deliveries under Inventory > Receiving.", "Perform stocktakes and investigate discrepancies before adjustments.", "Record damaged or quarantined stock separately from sellable stock."], caution: "A stock adjustment must reflect physical evidence, not be used to conceal a sale." },
  cashier: { purpose: "Serve customers at the POS and account for cash sessions.", steps: ["Sign in with your own cashier account and assigned branch.", "Open a cash session and process authorised sales.", "Issue receipts and follow the configured payment-verification workflow.", "Close and reconcile the session with the manager."], caution: "Never mark an uncertain electronic payment as successful without provider verification." },
  picker_packer: { purpose: "Prepare the right items and quantities for each confirmed order.", steps: ["Open assigned fulfilment tasks.", "Check product, variant, quantity and expiry.", "Record unavailable items and request an authorised substitution.", "Pack and hand over the order through the recorded workflow."], caution: "Do not replace items without approval or expose private customer information." },
  dispatcher: { purpose: "Coordinate deliveries, assignments and proof of delivery.", steps: ["Review orders ready for dispatch.", "Assign available riders or the configured manual delivery workflow.", "Track exceptions and delivery status changes.", "Confirm proof of delivery and close completed jobs."], caution: "External delivery-provider adapters shown in the dashboard are not necessarily connected." },
  finance_reviewer: { purpose: "Review payment evidence, refunds, cash reconciliation and audit records.", steps: ["Review payment attempts and unresolved reconciliation exceptions.", "Independently verify provider records before confirming payment.", "Review refund requests and record approval decisions.", "Review cash settlement and audit reports."], caution: "Do not retry a charge simply because verification is delayed." },
  rider: { purpose: "Deliver assigned orders and provide accurate delivery evidence.", steps: ["Open your rider workspace and review only assigned jobs.", "Confirm pickup and follow delivery instructions.", "Record arrival, delivery exceptions and proof of delivery.", "Mark completion only after actual handover."], caution: "Never share customer phone numbers or delivery addresses outside the authorised workflow." },
};

export default function RoleGuidesPage() {
  const [role, setRole] = useState<StaffRole>("owner_admin");
  const guide = guides[role]!;
  const permissions = Object.entries(PERMISSIONS).filter(([, roles]) => roles.includes(role)).map(([name]) => name);
  return <main className="mx-auto max-w-5xl space-y-5 pb-12">
    <div><h1 className="font-serif text-2xl font-bold">Role operating guides</h1><p className="mt-1 text-sm text-muted-foreground">Choose a role to view its responsibilities, day-to-day workflow and access summary. This describes the current predefined roles, not a custom-role editor.</p></div>
    <label className="block space-y-2 text-sm font-semibold">Role<select className="block min-h-11 w-full max-w-md rounded-md border bg-background px-3" value={role} onChange={e => setRole(e.target.value as StaffRole)}>{Object.entries(ROLE_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{ROLE_LABELS[role]}</h2><p>{guide.purpose}</p><h3 className="font-semibold">Daily workflow</h3><ol className="list-decimal space-y-2 pl-6 text-sm leading-6">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="rounded-lg border p-3 text-sm"><strong>Important:</strong> {guide.caution}</p></section>
    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Permission reference</h2><p className="mt-1 text-sm text-muted-foreground">These are the frontend role-matrix permissions. Backend authorisation remains authoritative.</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{permissions.map(p => <li key={p} className="rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">{p}</li>)}</ul></section>
    <nav className="flex flex-wrap gap-4 text-sm"><Link className="font-semibold text-primary underline" href="/admin/team">Team &amp; roles</Link><Link className="font-semibold text-primary underline" href="/admin/providers">Delivery providers</Link><Link className="font-semibold text-primary underline" href="/admin/settings">Business settings</Link></nav>
  </main>;
}
