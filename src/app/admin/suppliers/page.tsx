"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { filterSuppliers } from "@/features/staff/admin-operations-ux";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Landmark, Phone, Mail, Pencil, Search } from "lucide-react";

type SupplierRow = Awaited<ReturnType<typeof apiOps.suppliers>>[number];

export default function AdminSuppliersPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.suppliers(), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <LoadingState rows={4} label="Loading suppliers" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];
  const filtered = filterSuppliers(rows, query, status);

  const beginEdit = (supplier: SupplierRow) => {
    setEditing(supplier);
    setName(supplier.name);
    setPhone(supplier.phone);
    setEmail(supplier.email ?? "");
    setNotes(supplier.notes);
    setActive(supplier.isActive);
  };

  const save = async () => {
    if (!editing || !name.trim() || !phone.trim()) return;
    setBusy(editing.id);
    try {
      await apiOps.supplierUpdate({ supplierId: editing.id, name: name.trim(), phone: phone.trim(), email: email.trim(), notes: notes.trim(), isActive: active, actor: user.id });
      await reload();
      setEditing(null);
      toast({ title: "Supplier updated" });
    } catch (e) {
      toast({ title: "Supplier update failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (supplier: SupplierRow, next: boolean) => {
    setBusy(supplier.id);
    try {
      await apiOps.supplierUpdate({ supplierId: supplier.id, isActive: next, actor: user.id });
      await reload();
      toast({ title: next ? "Supplier activated" : "Supplier deactivated", description: next ? `${supplier.name} can now be selected for receiving and purchasing.` : `${supplier.name} remains in history but is hidden from new receiving selections.` });
    } catch (e) {
      toast({ title: "Status update failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Suppliers</h1>
        <p className="text-sm text-muted-foreground">Maintain supplier contacts, status and purchase-order activity. Demo contact details are fictional.</p>
      </div>

      <section aria-label="Supplier filters" className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" className="h-11 pl-9" placeholder="Search name, phone, email or notes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search suppliers" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 w-full" aria-label="Supplier status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active only</SelectItem><SelectItem value="inactive">Inactive only</SelectItem></SelectContent></Select>
      </section>

      {!rows.length ? <EmptyState icon={Landmark} title="No suppliers" /> : !filtered.length ? <EmptyState icon={Search} title="No suppliers match these filters" description="Clear the search or change the status filter." /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((s: SupplierRow) => (
            <article key={s.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2"><Landmark className="size-5 shrink-0 text-primary" aria-hidden /><div><h2 className="font-semibold">{s.name}</h2><Badge variant={s.isActive ? "secondary" : "outline"} className="mt-1">{s.isActive ? "active" : "inactive"}</Badge></div></div>
                {can("purchasing.manage") ? <div className="flex items-center gap-2"><Button size="sm" variant="outline" className="h-9" onClick={() => beginEdit(s)}><Pencil className="size-3.5" aria-hidden /> Edit</Button><label className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"><Switch checked={s.isActive} disabled={busy === s.id} onCheckedChange={(next) => void toggle(s, next)} aria-label={`${s.isActive ? "Deactivate" : "Activate"} ${s.name}`} />{s.isActive ? "Active" : "Inactive"}</label></div> : null}
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">{s.phone ? <p className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden /> {s.phone}</p> : null}{s.email ? <p className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden /> {s.email}</p> : null}</div>
              <p className="text-sm text-muted-foreground">{s.notes || "No supplier notes."}</p>
              <p className="border-t pt-2 text-xs text-muted-foreground">{s.poCount} purchase order(s) · {s.openPoCount} open</p>
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Edit supplier</DialogTitle><DialogDescription>Update contact details and whether this supplier is available for new purchasing and receiving.</DialogDescription></DialogHeader>
          {editing ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="sup-name">Supplier name *</Label><Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label htmlFor="sup-phone">Phone *</Label><Input id="sup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div></div><div><Label htmlFor="sup-email">Email</Label><Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><div><Label htmlFor="sup-notes">Notes</Label><Textarea id="sup-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div><label className="flex items-center justify-between rounded-lg border p-3 text-sm"><span><strong>Supplier status</strong><span className="block text-xs text-muted-foreground">Inactive suppliers stay in historical records.</span></span><span className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} />{active ? "Active" : "Inactive"}</span></label></div> : null}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} disabled={!!busy}>Cancel</Button><Button onClick={save} disabled={!!busy || !name.trim() || !phone.trim()}>{busy ? "Saving…" : "Save supplier"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
