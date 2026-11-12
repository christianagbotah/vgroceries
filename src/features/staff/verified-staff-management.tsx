"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/services/adapters/types";
import { verifiedPosUat } from "./verified-pos-uat-transport";
import {
  verifiedStaff, type VerifiedStaffRow, type VerifiedStaffList,
  type VerifiedCashierInvitation,
  type VerifiedCashierAction,
} from "./verified-staff-transport";

const enabled = process.env.NEXT_PUBLIC_POS_COUNTER_UAT === "1";
const roles = {
  admin: "Administrator",
  inventory_manager: "Inventory manager",
  cashier: "Cashier",
  rider: "Rider",
} as const;
function errorText(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === "UNAUTHENTICATED") return "Sign in with a real administrator account.";
    if (cause.code === "FORBIDDEN") return "Administrator permissions are required.";
    return cause.message;
  }
  return cause instanceof Error ? cause.message : "Staff management could not be verified.";
}

export function VerifiedStaffManagement() {
  const [csrf, setCsrf] = useState("");
  const [list, setList] = useState<VerifiedStaffList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [invitation, setInvitation] = useState<VerifiedCashierInvitation | null>(null);
  const [createLocations, setCreateLocations] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editLocations, setEditLocations] = useState<string[]>([]);
  const [resetPassword, setResetPassword] = useState("");

  const refresh = useCallback(async () => { setList(await verifiedStaff.list()); }, []);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let active = true;
    Promise.all([verifiedPosUat.session(), verifiedStaff.list()])
      .then(([session, data]) => {
        if (!active) return;
        if (session.actor.role !== "admin" || !session.csrfToken)
          throw new ApiError("FORBIDDEN", "A real administrator web session is required.");
        setCsrf(session.csrfToken);
        setList(data);
      })
      .catch(cause => { if (active) setError(errorText(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const current = useMemo(
    () => list?.staff.find(staff => staff.id === selectedId && staff.role === "cashier") ?? null,
    [list, selectedId],
  );
  const locations = list?.locations.filter(x => x.active) ?? [];

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await operation();
      await refresh();
      setNotice(success);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  function choose(staff: VerifiedStaffRow) {
    if (staff.role !== "cashier") return;
    setSelectedId(staff.id);
    setEditLocations([...staff.locationIds]);
    setResetPassword("");
    setNotice(null); setError(null);
  }

  function toggle(value: string, selected: string[], write: (ids: string[]) => void) {
    write(selected.includes(value) ? selected.filter(id => id !== value) : [...selected, value]);
  }

  const locationSelector = (
    selected: string[], write: (ids: string[]) => void, disabled: boolean,
  ) => (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">Active branch assignment</legend>
      {locations.length === 0 && <p className="text-sm text-muted-foreground">No active branches are available.</p>}
      <div className="flex flex-wrap gap-3">
        {locations.map(location => (
          <label key={location.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input type="checkbox" className="size-4" checked={selected.includes(location.id)}
              onChange={() => toggle(location.id, selected, write)} />
            <span>{location.name} <span className="text-muted-foreground">({location.id})</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  if (!enabled) return <main className="mx-auto max-w-3xl space-y-3 p-6">
    <h1 className="font-serif text-2xl font-bold">Verified staff management not enabled</h1>
    <p className="text-sm">The fictional demo team has been retired. Staff onboarding is disabled
      in this deployment until the secure staff-management release is approved.</p>
  </main>;

  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-12 sm:p-6">
    <header>
      <p className="text-sm font-semibold text-primary">Variety Groceries · Private staff UAT</p>
      <h1 className="font-serif text-2xl font-bold sm:text-3xl">Team &amp; real access</h1>
      <p className="mt-2 text-sm text-muted-foreground">Manage real database-backed cashier accounts,
        branch grants and session revocation. This page never generates fictional identities.</p>
    </header>
    <p className="rounded-xl border border-amber-500/50 p-4 text-sm leading-6">
      <strong>Staging only.</strong> The cashier chooses their own password using a 48-hour
      one-time invitation. No email provider is connected; pass the activation code securely
      to the intended synthetic UAT cashier. The code appears only once and must not be shared
      in public messages or stored in the repository. Branch reassignment, suspension and
      password resets revoke that cashier&apos;s active sessions.
      This screen cannot create administrators or grant additional roles.
    </p>
    {loading && <p role="status" className="rounded-xl border p-4">Verifying real administrator access…</p>}
    {error && <p role="alert" className="rounded-xl border border-destructive/50 p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-xl border p-4 text-sm">{notice}</p>}
    {!loading && !csrf && <a href="/staff/login?next=%2Fadmin%2Fteam" className="underline">
      Sign in with the private staging administrator account
    </a>}
    {!loading && csrf && list && <>
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Real staff accounts</h2>
          <Button variant="outline" disabled={busy}
            onClick={() => void run(refresh, "Current accounts and branch grants reloaded.")}>Refresh</Button>
        </div>
        {list.capped && <p role="status" className="text-sm">The list is capped at 500 accounts; narrow lists and pagination are needed before larger rollout.</p>}
        {list.staff.length === 0 && <p className="text-sm">No staff accounts are recorded.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {list.staff.map(staff => <article key={staff.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="font-semibold">{staff.name}</h3>
                <p className="break-all text-sm text-muted-foreground">{staff.email || "No email"}</p>
                <p className="text-sm text-muted-foreground">{roles[staff.role]}</p>
              </div>
              <span className="rounded-md border px-2 py-1 text-xs font-medium">
                {staff.active ? "Active" : "Suspended"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Branches: {staff.locationIds.length ? staff.locationIds.join(", ") : "No assignments"}
            </p>
            {staff.role === "cashier" && <Button type="button" variant="outline"
              disabled={busy} onClick={() => choose(staff)}>Manage cashier</Button>}
            {staff.role !== "cashier" && <p className="text-xs text-muted-foreground">
              This role is displayed for transparency, but cannot be edited by the cashier workflow.
            </p>}
          </article>)}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Invite an authorised cashier</h2>
        <p className="text-sm text-muted-foreground">The account remains inactive until the cashier sets a password. Reissue an expired invitation using the same email and branch selection.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium"><span>Full name</span>
            <Input autoComplete="off" value={name} disabled={busy} onChange={e => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm font-medium"><span>Email address</span>
            <Input type="email" autoComplete="off" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm font-medium"><span>Phone (optional)</span>
            <Input autoComplete="off" value={phone} disabled={busy} onChange={e => setPhone(e.target.value)} />
          </label>

        </div>
        {locationSelector(createLocations, setCreateLocations, busy)}
        <Button type="button" disabled={busy || name.trim().length < 2 ||
          !email.includes("@") || createLocations.length === 0}
          onClick={() => {
            if (!window.confirm(`Issue a single-use invitation for ${name.trim()} at the selected branches?`)) return;
            setInvitation(null);
            void run(async () => {
              const issued = await verifiedStaff.inviteCashier(csrf, {
                name: name.trim(), email: email.trim(), phone: phone.trim(),
                locationIds: createLocations,
              });
              setInvitation(issued);
              setName(""); setEmail(""); setPhone(""); setCreateLocations([]);
            }, "Invitation issued. Copy and share the one-time code privately.");
          }}>
          Issue cashier invitation
        </Button>
        {invitation && <div className="space-y-2 rounded-md border p-3" role="status">
          <p className="text-sm font-semibold">One-time invitation for {invitation.cashier.email}</p>
          <p className="text-sm">Expires: {new Date(invitation.expiresAt).toLocaleString("en-GH")}.
            The cashier opens <a className="underline" href="/staff/activate">Staff activation</a>
            and enters this code to set their password.</p>
          <code className="block break-all rounded bg-muted p-3 text-xs" data-testid="staff-invitation-code">{invitation.code}</code>
          <Button type="button" variant="outline" onClick={() => {
            void navigator.clipboard.writeText(invitation.code).catch(() => {
              setError("Clipboard unavailable. Select and copy the displayed code manually.");
            });
          }}>Copy invitation code</Button>
          <Button type="button" variant="outline" onClick={() => setInvitation(null)}>
            Hide code permanently
          </Button>
          <p className="text-xs text-muted-foreground">Do not share this code with anyone except its intended recipient.
            It cannot be retrieved after this page is closed.</p>
        </div>}
      </section>

      {current && <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Manage {current.name}</h2>
            <p className="text-sm text-muted-foreground">Cashier · {current.email}</p></div>
          <Button variant="outline" disabled={busy} onClick={() => setSelectedId(null)}>Close</Button>
        </div>
        {locationSelector(editLocations, setEditLocations, busy)}
        <Button variant="outline" disabled={busy || editLocations.length === 0}
          onClick={() => {
            if (!window.confirm("Save these branch grants? The cashier will be signed out of all active sessions.")) return;
            void run(() => verifiedStaff.manageCashier(csrf, current.id, {
              action: "assign_locations", locationIds: editLocations,
            }), "Branch grants changed; old sessions revoked.");
          }}>Save branch assignments</Button>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <p className="flex-1 text-sm">Account is currently <strong>{current.active ? "active" : "suspended"}</strong>.</p>
          <Button type="button" variant="outline" disabled={busy}
            onClick={() => {
              const nextActive = !current.active;
              if (!window.confirm(`${nextActive ? "Reactivate" : "Suspend"} ${current.name}? All current sessions will be revoked.`)) return;
              void run(() => verifiedStaff.manageCashier(csrf, current.id, {
                action: "set_active", active: nextActive,
              }), nextActive ? "Cashier reactivated; new sign-in required." : "Cashier suspended and sessions revoked.");
            }}>{current.active ? "Suspend cashier" : "Reactivate cashier"}</Button>
        </div>
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Administrator-issued password reset</h3>
          <label className="block space-y-1 text-sm font-medium"><span>New password (12–256 characters)</span>
            <Input type="password" autoComplete="new-password" disabled={busy}
              value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
          </label>
          <Button type="button" variant="outline" disabled={busy || resetPassword.length < 12}
            onClick={() => {
              if (!window.confirm("Reset this cashier's password and revoke every current session?")) return;
              void run(async () => {
                await verifiedStaff.manageCashier(csrf, current.id, {
                  action: "reset_password", password: resetPassword,
                } satisfies VerifiedCashierAction);
                setResetPassword("");
              }, "Cashier password reset and old sessions revoked.");
            }}>Reset cashier password</Button>
        </div>
      </section>}
    </>}
  </main>;
}
