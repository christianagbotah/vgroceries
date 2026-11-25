"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { StaffList, IssuedCashierInvitation } from "@/services/contracts";
import { apiOps, ApiError } from "@/services/client";
import { isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const enabled = process.env.NEXT_PUBLIC_STAFF_ONBOARDING_UAT === "1";
const date = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  timeZone: "Africa/Accra", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

export default function VerifiedStaffPage() {
  const [staff, setStaff] = useState<StaffList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [invitation, setInvitation] = useState<IssuedCashierInvitation | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const current = staff?.staff.find(x => x.id === selected && (x.role === "cashier" || x.role === "inventory_manager"));
  const available = staff?.locations.filter(x => x.active) ?? [];

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (isDemoStaffSessionActive()) throw new ApiError("FORBIDDEN", "Use a real administrator sign-in, not a sample role.");
    const session = await apiOps.staffSession();
    if (session.actor.role !== "admin") throw new ApiError("FORBIDDEN", "An administrator account is required.");
    setStaff(await apiOps.staffRealList());
  }, []);
  useEffect(() => {
    let active = true;
    refresh().catch(e => { if (active) setError(e instanceof ApiError ? e.message : "Staff listing unavailable."); });
    return () => { active = false; };
  }, [refresh]);

  async function act(task: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await task();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Operation could not be completed.");
    } finally { setBusy(false); }
  }
  function chooseBranch(id: string, current: string[], change: (ids: string[]) => void) {
    change(current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  }
  const branchChoices = (chosen: string[], change: (ids: string[]) => void) =>
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold">Active branch assignments</legend>
      {available.map(branch => (
        <label key={branch.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
          <input type="checkbox" className="size-4" checked={chosen.includes(branch.id)}
            onChange={() => chooseBranch(branch.id, chosen, change)} disabled={busy} />
          <span>{branch.name}</span>
        </label>
      ))}
    </fieldset>;

  if (!enabled) return <section className="space-y-3 p-4">
    <h1 className="font-serif text-2xl font-bold">Verified staff onboarding is disabled</h1>
    <p className="text-sm">The invitation system must pass private operational acceptance before activation.</p>
    <Link href="/admin/team" className="text-primary underline">Back to team</Link>
  </section>;

  return <section className="mx-auto max-w-5xl space-y-5 pb-12">
    <div>
      <p className="text-sm font-semibold text-primary">Variety Groceries · Protected UAT</p>
      <h1 className="font-serif text-3xl font-bold">Verified staff &amp; location assignments</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Invite real cashier accounts and manage active locations for cashiers and inventory managers. Cashiers choose their own password. This page does not enable selling or move money.</p>
    </div>
    <p className="rounded-lg border p-4 text-sm">Private UAT accounts only. A one-time code is displayed once. Share it privately with the intended cashier; it is not sent automatically by email or SMS. Never put codes in public chats or screenshots.</p>
    {error ? <p role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="rounded-lg border p-4 text-sm">{notice}</p> : null}
    <Card>
      <CardHeader><CardTitle>Invite a cashier</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault();
          if (!branches.length) { setError("Assign at least one active branch."); return; }
          void act(async () => {
            const issued = await apiOps.staffInvite({ name, email, phone, locationIds: branches });
            setInvitation(issued); setName(""); setEmail(""); setPhone(""); setBranches([]);
          }, "One-time cashier invitation issued. Deliver the code securely.");
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Full name<Input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
            <label className="space-y-1 text-sm">Email<Input required type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
            <label className="space-y-1 text-sm">Phone (optional)<Input value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} disabled={busy} /></label>
          </div>
          {branchChoices(branches, setBranches)}
          <Button disabled={busy || branches.length === 0} className="min-h-11" type="submit">Issue one-time invitation</Button>
        </form>
        {invitation ? <div className="mt-5 space-y-2 rounded-xl border border-primary/40 p-4" role="status">
          <p className="font-semibold">New invitation — copy before leaving</p>
          <p className="text-sm">For {invitation.cashier.email}. Expires {date(invitation.expiresAt)}.</p>
          <p className="break-all rounded bg-muted p-3 font-mono text-sm select-all">{invitation.code}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(invitation.code)}>Copy code</Button>
            <Button type="button" variant="outline" onClick={() => setInvitation(null)}>Hide code</Button>
            <Link href="/staff/activate" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline">Cashier activation page</Link>
          </div>
          <p className="text-xs text-muted-foreground">Only the code digest is saved on the server; this page does not keep an invitation history.</p>
        </div> : null}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Current real staff</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" disabled={busy} onClick={() => void act(async () => { await refresh(); }, "Staff list refreshed.")}>Refresh</Button>
        {staff?.capped ? <p className="text-sm">Displaying the first 500 staff records.</p> : null}
        {!staff && !error ? <p role="status" className="text-sm">Verifying administrator role…</p> : null}
        {staff?.staff.map(row => <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{row.name}</p><p className="break-all">{row.email}</p>
            <p className="text-muted-foreground">{row.role} · {row.active ? "Active" : "Inactive"} · {row.invitationStatus}</p>
            <p className="text-muted-foreground">Branches: {row.locationIds.map(id => staff.locations.find(loc => loc.id === id)?.name ?? id).join(", ") || "none"}</p>
          </div>
          {(row.role === "cashier" || row.role === "inventory_manager") ? <Button variant="outline" onClick={() => {setSelected(row.id); setAssigned([...row.locationIds]); setInvitation(null);}}>Manage assignments</Button> : null}
        </article>)}
        {current ? <div className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">Manage {current.name}</h3>
          {branchChoices(assigned, setAssigned)}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !assigned.length} onClick={() => void act(async () => {
              await apiOps.staffManageCashier(current.id, {action:"assign_locations", locationIds:assigned});
            }, "Locations changed and prior staff sessions revoked.")}>Save assignments</Button>
            {current.role === "cashier" ? <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
              await apiOps.staffManageCashier(current.id, {action:"set_active", active:!current.active});
            }, "Cashier status changed and prior sessions revoked.")}>{current.active ? "Suspend cashier" : "Reactivate cashier"}</Button> : null}
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </div>
          {current.role === "cashier" ? <p className="text-xs text-muted-foreground">Reactivating an unaccepted invitation is blocked. Reissue an invitation using the same email if the previous code expired.</p> : <p className="text-xs text-muted-foreground">Inventory permissions remain role-based. Location assignments limit location-aware inventory actions; they do not grant administrator access.</p>}
        </div> : null}
      </CardContent>
    </Card>
  </section>;
}
