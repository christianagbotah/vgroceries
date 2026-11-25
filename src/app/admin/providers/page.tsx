"use client";
import {useState} from "react";
import Link from "next/link";
import {configurationApi,type Partner,type PartnerInput} from "@/features/staff/configuration/client";
import {useApiData} from "@/features/staff/admin-data";
import {useToast} from "@/hooks/use-toast";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {LoadingState,ErrorState} from "@/components/shared/states";
import {Plus,Pencil} from "lucide-react";
const blank:PartnerInput={name:"",contactPhone:"",contactEmail:"",coverage:"",notes:"",active:true};
const fields=[["name","Provider name"],["contactPhone","Contact phone (+233…)"],["contactEmail","Contact email"],["coverage","Coverage areas"],["notes","Operational notes"]] as const;
export default function AdminProvidersPage(){
 const {data,loading,error,reload,setData}=useApiData(configurationApi.partners,[]);
 const {toast}=useToast();
 const [open,setOpen]=useState(false);const [selected,setSelected]=useState<Partner|null>(null);const [form,setForm]=useState<PartnerInput>(blank);const [busy,setBusy]=useState(false);
 function edit(p?:Partner){setSelected(p??null);setForm(p?{name:p.name,contactPhone:p.contactPhone,contactEmail:p.contactEmail,coverage:p.coverage,notes:p.notes,active:p.active}:{...blank});setOpen(true);}
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);try{const result=selected?await configurationApi.updatePartner(selected.id,{...form,version:selected.version}):await configurationApi.createPartner(form);setData(old=>[...(old??[]).filter(p=>p.id!==result.id),result].sort((a,b)=>a.name.localeCompare(b.name)));setOpen(false);toast({title:"Delivery provider saved"});await reload();}catch(e){toast({title:"Could not save provider",description:e instanceof Error?e.message:undefined,variant:"destructive"});}finally{setBusy(false);}}
 return <main className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-serif text-2xl font-bold">Delivery providers</h1><p className="text-sm text-muted-foreground">Manage your manual courier partner directory.</p></div><Button onClick={()=>edit()} disabled={!data||loading||!!error}><Plus className="size-4"/>Add provider</Button></header>
 {loading?<LoadingState/>:error?<ErrorState message={error} onRetry={reload}/>:data?.length?<div className="grid gap-3 lg:grid-cols-2">{data.map(p=><article key={p.id} className="space-y-3 rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{p.name}</h2><p className="text-sm text-muted-foreground">{p.active?"Active directory entry":"Inactive"} · Manual partner</p></div><Button variant="outline" size="sm" onClick={()=>edit(p)}><Pencil className="size-4"/>Edit</Button></div><p className="text-sm">{p.coverage||"Coverage not entered"}</p><p className="text-sm text-muted-foreground">{[p.contactPhone,p.contactEmail].filter(Boolean).join(" · ")}</p><p className="text-sm">{p.notes}</p></article>)}</div>:<div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No delivery partners saved. Use Add provider to create one.</div>}
 <p className="rounded-lg border p-3 text-sm text-muted-foreground">Directory entries do not activate an external courier API or automatically route shipments. <Link className="font-semibold text-primary underline" href="/admin/dispatch/providers">Open manual courier dispatch</Link> to record assignments.</p>
 <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent><DialogHeader><DialogTitle>{selected?"Edit delivery provider":"Add delivery provider"}</DialogTitle><DialogDescription>Save contact and coverage information for a manual partner.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">{fields.map(([key,label])=><div key={key} className="space-y-1"><Label htmlFor={key}>{label}</Label><Input id={key} value={form[key]} required={key==="name"} type={key==="contactEmail"?"email":"text"} disabled={busy} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}<div className="flex items-center justify-between"><Label htmlFor="active">Active directory entry</Label><Switch id="active" checked={form.active} disabled={busy} onCheckedChange={active=>setForm({...form,active})}/></div><Button className="w-full" type="submit" disabled={busy}>{busy?"Saving…":"Save provider"}</Button></form></DialogContent></Dialog>
 </main>;
}
