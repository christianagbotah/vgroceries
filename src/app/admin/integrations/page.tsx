"use client";
import {useState} from "react";
import Link from "next/link";
import {useApiData} from "@/features/staff/admin-data";
import {configurationApi,type IntegrationId} from "@/features/staff/configuration/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {LoadingState,ErrorState} from "@/components/shared/states";
import {useToast} from "@/hooks/use-toast";
import {ShieldCheck,KeyRound} from "lucide-react";
const definitions:Record<IntegrationId,{name:string;fields:{key:string;label:string;secret:boolean}[]}>={
 "hubtel-checkout":{name:"Hubtel Online Checkout",fields:[{key:"clientId",label:"Client ID",secret:true},{key:"clientSecret",label:"Client secret",secret:true},{key:"merchantAccountNumber",label:"Merchant account number",secret:false}]},
 "hubtel-sms":{name:"Hubtel SMS",fields:[{key:"clientId",label:"Client ID",secret:true},{key:"clientSecret",label:"Client secret",secret:true},{key:"senderId",label:"Sender ID",secret:false}]},
 "paystack-payment":{name:"Paystack",fields:[{key:"secretKey",label:"Secret key",secret:true}]},
};
export default function IntegrationsPage(){
 const {data,loading,error,reload}=useApiData(configurationApi.credentials,[]);
 const {toast}=useToast();
 const [selected,setSelected]=useState<{id:IntegrationId;version:number}|null>(null);
 const [values,setValues]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 function close(){setSelected(null);setValues({});}
 async function save(e:React.FormEvent){e.preventDefault();if(!selected||busy||!data?.vaultReady)return;setBusy(true);try{await configurationApi.saveDraft(selected.id,selected.version,values);close();toast({title:"Encrypted credential draft saved",description:"The active integration has not changed."});await reload();}catch{setValues({});toast({title:"Credential draft could not be saved",description:"Reload the status and re-enter the credentials. No active integration was changed.",variant:"destructive"});}finally{setBusy(false);}}
 return <main className="mx-auto max-w-5xl space-y-5 pb-12">
 <header><h1 className="font-serif text-2xl font-bold">Integrations &amp; providers</h1><p className="text-sm text-muted-foreground">Manage encrypted credential candidates separately from active provider configuration.</p></header>
 <div className="flex gap-3 rounded-xl border p-4"><ShieldCheck className="mt-1 size-5 shrink-0 text-primary"/><div><h2 className="font-semibold">Secure credential vault</h2><p className="text-sm text-muted-foreground">Credentials are never displayed after saving. Drafts do not switch payment providers or activate SMS. Connection testing and controlled activation are not available yet.</p></div></div>
 {loading?<LoadingState/>:error?<ErrorState message={error} onRetry={reload}/>:data?<><p className="text-sm" role="status">{data.vaultReady?"Credential vault provisioned.":"Credential vault is not provisioned. Entry is disabled until an authorized deployment configures the encryption key."}</p><div className="grid gap-4 lg:grid-cols-2">{data.providers.map(p=><article key={p.id} className="space-y-3 rounded-xl border bg-card p-5"><h2 className="font-semibold">{definitions[p.id].name}</h2><p className="text-sm">Runtime configuration: {p.runtimeConfigured?"Present (not a connection test)":"Not configured"}</p><p className="text-sm text-muted-foreground">{p.draft?"Encrypted draft saved · revision "+p.draft.version:"No draft saved"}</p><Button disabled={!data.vaultReady||busy} variant="outline" onClick={()=>{setValues({});setSelected({id:p.id,version:p.draft?.version??0});}}><KeyRound className="size-4"/>{p.draft?"Replace credential draft":"Enter credentials"}</Button></article>)}</div></>:null}
 <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Delivery partners</h2><Link href="/admin/providers" className="text-sm font-medium text-primary underline">Manage delivery providers</Link></section>
 <Dialog open={!!selected} onOpenChange={v=>{if(!v&&!busy)close();}}><DialogContent><DialogHeader><DialogTitle>{selected?definitions[selected.id].name:"Integration credentials"}</DialogTitle><DialogDescription>Enter all required values. Saving creates an encrypted draft only; current live settings remain unchanged.</DialogDescription></DialogHeader>{selected&&<form onSubmit={save} autoComplete="off" className="space-y-4">{definitions[selected.id].fields.map(f=><div key={f.key} className="space-y-1"><Label htmlFor={"credential-"+f.key}>{f.label}</Label><Input id={"credential-"+f.key} type={f.secret?"password":"text"} autoComplete="off" spellCheck={false} required disabled={busy} value={values[f.key]??""} onChange={e=>setValues({...values,[f.key]:e.target.value})}/></div>)}<Button type="submit" className="w-full" disabled={busy||!data?.vaultReady}>{busy?"Encrypting and saving…":"Save encrypted draft"}</Button></form>}</DialogContent></Dialog>
 </main>;
}
