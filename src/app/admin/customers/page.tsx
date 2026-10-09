"use client";

import Link from "next/link";
import { useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserRound, Phone, Mail, MapPin, Search } from "lucide-react";
import { formatDate } from "@/lib/format";

type CustomerRow = Awaited<ReturnType<typeof apiOps.customers>>[number];
type Detail = Awaited<ReturnType<typeof apiOps.customer>>;

export default function AdminCustomersPage() {
  const { can } = useStaff();
  const { data, loading, error, reload } = useApiData(() => apiOps.customers(), []);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");

  if (loading) return <LoadingState rows={4} label="Loading customers" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = (data ?? []).filter((c: CustomerRow) => !q || `${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          History, support notes and permitted contact actions. Demo contacts are fictional;
          production contact channels and consent are configured by the owner.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" className="h-11 pl-9" placeholder="Name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </div>

      {!rows.length ? (
        <EmptyState icon={UserRound} title="No customers match" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Customer</th>
                  <th className="p-3 font-semibold">Orders</th>
                  <th className="p-3 text-right font-semibold">Spend</th>
                  <th className="p-3 text-right font-semibold">Returns</th>
                  <th className="hidden p-3 font-semibold md:table-cell">Since</th>
                  <th className="p-3 text-right font-semibold">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: CustomerRow) => (
                  <tr key={c.id} className="border-t hover:bg-accent/50">
                    <td className="p-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                    </td>
                    <td className="p-3 tabular-nums">{c.orderCount}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{c.spendLabel}</td>
                    <td className="p-3 text-right tabular-nums">{c.returnCount}</td>
                    <td className="hidden p-3 text-muted-foreground md:table-cell">{formatDate(c.createdAt)}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9"
                        onClick={async () => {
                          setDetail(await apiOps.customer(c.id));
                          setNote("");
                        }}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserRound className="size-5 text-primary" aria-hidden /> {detail.customer.name}
                </DialogTitle>
                <DialogDescription>Customer record (demo data)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden /> {detail.customer.phone}</span>
                  {detail.customer.email ? <span className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden /> {detail.customer.email}</span> : null}
                  {detail.addresses.length ? (
                    <span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5" aria-hidden /> {(detail.addresses as { street: string; locality: string }[]).map((a) => `${a.street}, ${a.locality}`).join(" · ")}</span>
                  ) : null}
                </div>
                {detail.customer.supportNotes.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">Support notes</h3>
                    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {detail.customer.supportNotes.map((n, i) => <li key={i}>• {n}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="text-sm font-semibold">Orders ({detail.orders.length})</h3>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm scroll-soft">
                    {detail.orders.map((o) => (
                      <li key={o.id} className="flex justify-between gap-2">
                        <Link href={`/admin/orders/${o.id}`} className="text-primary hover:underline focus-visible:underline">{o.reference}</Link>
                        <span className="text-muted-foreground">{o.createdAtLabel} · {o.totalLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {detail.returns.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">Returns</h3>
                    <ul className="mt-1 space-y-1 text-sm">
                      {detail.returns.map((r) => (
                        <li key={r.id} className="flex justify-between gap-2">
                          <Link href={`/admin/returns/${r.id}`} className="text-primary hover:underline">{r.reference}</Link>
                          <span className="text-muted-foreground">{r.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {can("customers.contact") ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <Label htmlFor="cs-note">Add a support note</Label>
                    <Textarea id="cs-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded internally — never shared with the customer" />
                    <Button size="sm" className="h-9" disabled={!note.trim()}>
                      Save note (demo — write API pending)
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Contact actions (call, WhatsApp, SMS) are placeholder links until the owner
                      configures channels and consent rules.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
