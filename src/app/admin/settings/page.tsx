"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { useToast } from "@/hooks/use-toast";
import { configurationApi, type BusinessInput, type BusinessProfile } from "@/features/staff/configuration/client";

const fields = [
 ["businessName","Business name"],["supportPhone","Support phone (international format)"],["supportEmail","Support email"],
 ["address","Business address"],["registrationNumber","Registration number"],["operatingHours","Operating hours"],["receiptFooter","Receipt footer"],
] as const;
function toInput(p:BusinessProfile):BusinessInput {
 return {version:p.version,businessName:p.businessName,supportPhone:p.supportPhone,supportEmail:p.supportEmail,address:p.address,registrationNumber:p.registrationNumber,operatingHours:p.operatingHours,receiptFooter:p.receiptFooter};
}
export default function AdminSettingsPage(){
 const {toast}=useToast();
 const [form,setForm]=useState<BusinessInput|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{let active=true;configurationApi.business().then(p=>{if(active){setForm(toInput(p));setError(null);}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load business settings.");});return()=>{active=false;};},[reload]);
 async function save(e:React.FormEvent){e.preventDefault();if(!form||busy)return;setBusy(true);try{setForm(toInput(await configurationApi.saveBusiness(form)));toast({title:"Business settings saved"});}catch(e){toast({title:"Save failed",description:e instanceof Error?e.message:undefined,variant:"destructive"});}finally{setBusy(false);}}
 return <main className="mx-auto max-w-5xl space-y-5 pb-12">
 <header><h1 className="font-serif text-2xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Manage your business identity and administrative configuration.</p></header>
 <div className="grid gap-3 sm:grid-cols-2"><Link className="rounded-xl border bg-card p-4 font-semibold text-primary" href="/admin/integrations">Payment &amp; SMS integrations</Link><Link className="rounded-xl border bg-card p-4 font-semibold text-primary" href="/admin/providers">Delivery providers</Link></div>
 {error?<ErrorState message={error} onRetry={()=>setReload(v=>v+1)}/>:!form?<LoadingState label="Loading business settings"/>:
 <form onSubmit={save} className="space-y-5 rounded-xl border bg-card p-5">
 <div><h2 className="text-lg font-semibold">Business profile</h2><p className="text-sm text-muted-foreground">Support phone, email, address and hours are published on the storefront. Receipt footer is used as current support information, not historical invoice identity.</p></div>
 <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key,label])=><div key={key} className="space-y-1.5"><Label htmlFor={key}>{label}</Label><Input id={key} value={form[key]} disabled={busy} required={key==="businessName"} type={key==="supportEmail"?"email":"text"} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}<div className="space-y-1.5"><Label htmlFor="currency">Currency</Label><Input id="currency" value="Ghana cedi (₵)" readOnly/></div></div>
 <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}>{busy?"Saving…":"Save changes"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setReload(v=>v+1)}>Reload saved settings</Button></div>
 </form>}
 <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Operational and financial controls</h2><p className="mt-2 text-sm text-muted-foreground">Delivery availability, reservation timing, COD and refund approvals remain controlled by the verified operational backend. They cannot be changed through this business profile.</p></section>
 </main>;
}
