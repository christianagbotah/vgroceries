"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import type { LogisticsNodeView, LogisticsNodeKind } from "@/services/contracts";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search, X } from "lucide-react";

const KINDS: { value: LogisticsNodeKind; label: string }[] = [
  ["head_office", "Head office"], ["warehouse", "Warehouse"], ["fulfilment_center", "Fulfilment / picking centre"],
  ["hub", "Hub"], ["outlet", "Outlet"], ["pickup_point", "Pickup point"], ["cross_dock", "Cross-dock"],
  ["partner_facility", "Partner facility"], ["other", "Other"],
].map(([value, label]) => ({ value: value as LogisticsNodeKind, label }));

type FormState = {
  code: string; name: string; publicName: string; kind: LogisticsNodeKind; kindLabel: string;
  parentNodeId: string; inventoryLocationId: string; addressLine: string; locality: string; region: string;
  ghanaPostGps: string; publicDirections: string; publicContact: string; customerVisible: boolean; active: boolean;
};
const emptyForm = (): FormState => ({ code: "", name: "", publicName: "", kind: "hub", kindLabel: "", parentNodeId: "", inventoryLocationId: "", addressLine: "", locality: "", region: "", ghanaPostGps: "", publicDirections: "", publicContact: "", customerVisible: true, active: true });
const fromNode = (n: LogisticsNodeView): FormState => ({ code:n.code, name:n.name, publicName:n.publicName, kind:n.kind, kindLabel:n.kindLabel ?? "", parentNodeId:n.parentNodeId ?? "", inventoryLocationId:n.inventoryLocationId ?? "", addressLine:n.addressLine ?? "", locality:n.locality ?? "", region:n.region ?? "", ghanaPostGps:n.ghanaPostGps ?? "", publicDirections:n.publicDirections ?? "", publicContact:n.publicContact ?? "", customerVisible:n.customerVisible, active:n.active });

export function NodesPanel() {
  const { data, loading, error, reload } = useApiData(() => apiOps.logisticsNodes(), []);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (form) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [form, editingId]);

  const rows = useMemo(() => (data ?? []).filter((node) => `${node.code} ${node.name} ${node.publicName}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search]);
  const startCreate = () => { setEditingId(null); setForm(emptyForm()); setFormError(null); };
  const startEdit = (node: LogisticsNodeView) => { setEditingId(node.id); setForm(fromNode(node)); setFormError(null); };
  const save = async () => {
    if (!form) return;
    setSaving(true); setFormError(null);
    try {
      const body = { ...form, kindLabel: form.kindLabel || null, parentNodeId: form.parentNodeId || null, inventoryLocationId: form.inventoryLocationId || null, addressLine: form.addressLine || null, locality: form.locality || null, region: form.region || null, ghanaPostGps: form.ghanaPostGps || null, publicDirections: form.publicDirections || null, publicContact: form.publicContact || null };
      if (editingId) await apiOps.logisticsNodeUpdate(editingId, body, crypto.randomUUID());
      else await apiOps.logisticsNodeCreate(body, crypto.randomUUID());
      setForm(null); setEditingId(null); await reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not save the logistics node.");
    } finally { setSaving(false); }
  };
  const deactivate = async (node: LogisticsNodeView) => {
    if (!window.confirm(`Deactivate ${node.name}? Active routes or lanes must be removed first.`)) return;
    setEditingId(node.id); setForm(fromNode(node)); setFormError(null); setSaving(true);
    try { await apiOps.logisticsNodeUpdate(node.id, { active: false }, crypto.randomUUID()); setForm(null); setEditingId(null); await reload(); }
    catch (e) { setFormError(e instanceof ApiError ? e.message : "Dependencies prevent this node from being deactivated."); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState rows={5} label="Loading logistics locations" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return <div className="min-w-0 space-y-4 pt-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-[220px] flex-1 max-w-lg"><Label htmlFor="node-search">Search locations</Label><div className="relative mt-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input id="node-search" className="h-10 pl-9" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Code, internal name or public name" /></div></div>
      <Button onClick={startCreate}><Plus className="size-4" aria-hidden /> Add location or hub</Button>
    </div>

    {form ? <div ref={editorRef} className="scroll-mt-24 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg font-bold">{editingId ? "Edit location or hub" : "Add location or hub"}</h3><p className="text-sm text-muted-foreground">Node configuration describes the network; it does not record parcel arrival.</p></div><Button variant="ghost" size="icon" onClick={()=>{setForm(null);setEditingId(null);setFormError(null)}} aria-label="Close node form"><X className="size-4" /></Button></div>
      {formError ? <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Node code" id="node-code"><Input id="node-code" value={form.code} onChange={(e)=>setForm({...form,code:e.target.value})} disabled={!!editingId} /></Field>
        <div><Label htmlFor="node-kind">Node type</Label><Select value={form.kind} onValueChange={(v)=>setForm({...form,kind:v as LogisticsNodeKind})}><SelectTrigger id="node-kind" className="mt-1 h-10"><SelectValue /></SelectTrigger><SelectContent>{KINDS.map(k=><SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></div>
        <Field label="Internal name" id="node-name"><Input id="node-name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /></Field>
        <Field label="Customer-visible name" id="node-public-name"><Input id="node-public-name" value={form.publicName} onChange={(e)=>setForm({...form,publicName:e.target.value})} /></Field>
        <div><Label htmlFor="node-parent">Parent / group node</Label><Select value={form.parentNodeId || "none"} onValueChange={(v)=>setForm({...form,parentNodeId:v==="none"?"":v})}><SelectTrigger id="node-parent" className="mt-1 h-10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No parent</SelectItem>{(data??[]).filter(n=>n.id!==editingId).map(n=><SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent></Select></div>
        <Field label="Inventory location reference" id="node-inventory"><Input id="node-inventory" value={form.inventoryLocationId} onChange={(e)=>setForm({...form,inventoryLocationId:e.target.value})} placeholder="Optional existing inventory location ID" /></Field>
        <Field label="Address" id="node-address"><Input id="node-address" value={form.addressLine} onChange={(e)=>setForm({...form,addressLine:e.target.value})} /></Field>
        <Field label="Locality" id="node-locality"><Input id="node-locality" value={form.locality} onChange={(e)=>setForm({...form,locality:e.target.value})} /></Field>
        <Field label="Region" id="node-region"><Input id="node-region" value={form.region} onChange={(e)=>setForm({...form,region:e.target.value})} /></Field>
        <Field label="GhanaPost GPS" id="node-gps"><Input id="node-gps" value={form.ghanaPostGps} onChange={(e)=>setForm({...form,ghanaPostGps:e.target.value})} /></Field>
        <Field label="Public contact" id="node-contact"><Input id="node-contact" value={form.publicContact} onChange={(e)=>setForm({...form,publicContact:e.target.value})} placeholder="Customer-safe phone or instructions" /></Field>
        <div className="md:col-span-2"><Label htmlFor="node-directions">Public directions</Label><Textarea id="node-directions" className="mt-1" value={form.publicDirections} onChange={(e)=>setForm({...form,publicDirections:e.target.value})} placeholder="Customer-safe pickup directions" /></div>
        <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Customer-visible</p><p className="text-xs text-muted-foreground">Allow this facility name in customer-safe tracking later.</p></div><Switch checked={form.customerVisible} onCheckedChange={(v)=>setForm({...form,customerVisible:v})} /></div>
        <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Active</p><p className="text-xs text-muted-foreground">Inactive nodes cannot be used by new active routes.</p></div><Switch checked={form.active} onCheckedChange={(v)=>setForm({...form,active:v})} /></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button onClick={save} disabled={saving || !form.code.trim() || !form.name.trim() || !form.publicName.trim()}>{saving?"Saving…":"Save node"}</Button><Button variant="outline" onClick={()=>{setForm(null);setEditingId(null)}}>Cancel</Button></div>
    </div> : null}

    {!rows.length ? <EmptyState icon={Building2} title="No logistics locations found" description="Add a source location, warehouse, hub, outlet or pickup point." /> : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{rows.map(node=><article key={node.id} className="min-w-0 rounded-xl border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{node.publicName}</h3><Badge variant="outline">{node.kind.replaceAll("_"," ")}</Badge>{node.customerVisible?<Badge variant="secondary">Customer-visible</Badge>:null}{!node.active?<Badge variant="destructive">Inactive</Badge>:null}</div><p className="mt-1 text-sm text-muted-foreground">{node.code} · {node.name}</p><p className="text-xs text-muted-foreground">{[node.locality,node.region].filter(Boolean).join(" · ") || "No public location detail"}</p></div><Button variant="outline" size="sm" onClick={()=>startEdit(node)}>Edit</Button></div><div className="mt-3 rounded-lg bg-muted/45 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dependencies</p><p className="mt-1 text-xs text-muted-foreground">{node.dependencies?.activeIncomingLanes ?? 0} incoming lanes · {node.dependencies?.activeOutgoingLanes ?? 0} outgoing lanes · {node.dependencies?.activeRouteRules ?? 0} active route rules · {node.dependencies?.childNodes ?? 0} child nodes</p></div>{node.active?<Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={()=>deactivate(node)}>Deactivate node</Button>:null}</article>)}</div>}
  </div>;
}

function Field({label,id,children}:{label:string;id:string;children:React.ReactNode}) { return <div><Label htmlFor={id}>{label}</Label><div className="mt-1">{children}</div></div>; }
