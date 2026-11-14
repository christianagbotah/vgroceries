"use client";
import { useRef, useState, type FormEvent } from "react";
import { useSubmissionFeedbackFocus } from "@/hooks/use-submission-feedback-focus";
import Link from "next/link";
import { Headphones, PhoneCall, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/services/client";

type Receipt={reference:string;status:string;createdAt:string;note:string};
const subjects=[
 ["order","Order question"],["delivery","Delivery or collection"],
 ["payment","Payment or checkout"],["return","Return or refund"],
 ["product","Product information"],["other","Other enquiry"],
] as const;
export default function CustomerSupportPage(){
 const [name,setName]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState("");
 const [subject,setSubject]=useState("order"),[message,setMessage]=useState("");
 const [orderReference,setOrderReference]=useState(""),[preferredContact,setPreferredContact]=useState("phone");
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[receipt,setReceipt]=useState<Receipt|null>(null);
 const receiptRef=useRef<HTMLElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
 useSubmissionFeedbackFocus(receipt,receiptRef);
 useSubmissionFeedbackFocus(error,errorRef);
 const send=async(e:FormEvent)=>{
  e.preventDefault();if(busy)return;setError("");setBusy(true);
  try{
   const data=await api<Receipt>("support.create",{body:{name:name.trim(),phone:phone.trim(),
     email:email.trim(),subject,message:message.trim(),orderReference:orderReference.trim(),
     preferredContact,consent}});
   setReceipt(data);
  }catch(cause){
   setError(cause instanceof ApiError?cause.message:"Support request could not be recorded. Please retry.");
  }finally{setBusy(false);}
 };
 const field="h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary";
 return <main className="mx-auto max-w-3xl space-y-6 px-4 py-9">
   <header className="space-y-2">
    <p className="flex items-center gap-2 text-sm font-bold text-primary"><Headphones className="size-5"/> Customer care</p>
    <h1 className="font-serif text-3xl font-black">Speak with Variety Groceries</h1>
    <p className="text-sm leading-6 text-muted-foreground">Ask our shopping assistant for product questions or request a follow-up from a human team member. This form records a request; it does not immediately place a call or send a message.</p>
   </header>
   {receipt?<section ref={receiptRef} tabIndex={-1} role="status" aria-labelledby="support-response-title" className="scroll-mt-28 space-y-4 rounded-2xl border bg-card p-6 outline-none focus-visible:ring-2 focus-visible:ring-primary">
     <ShieldCheck className="size-9 text-primary"/>
     <h2 id="support-response-title" className="text-xl font-bold">Your request was recorded</h2>
     <p>Reference: <strong className="font-mono">{receipt.reference}</strong></p>
     <p className="text-sm text-muted-foreground">{receipt.note} Keep this reference for future enquiries.</p>
     <div className="flex flex-wrap gap-3"><Link href="/shop" className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white">Return to shop</Link><Link href="/assistant" className="rounded-xl border px-4 py-3 text-sm font-bold">Ask shopping assistant</Link></div>
   </section>:<form onSubmit={send} className="space-y-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="grid gap-4 sm:grid-cols-2">
     <label className="space-y-1.5 text-sm font-semibold">Your name<input className={field} required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>
     <label className="space-y-1.5 text-sm font-semibold">Ghana phone number<input className={field} required type="tel" autoComplete="tel" maxLength={20} placeholder="024..." value={phone} onChange={e=>setPhone(e.target.value)}/></label>
     <label className="space-y-1.5 text-sm font-semibold">Email (optional)<input className={field} type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label className="space-y-1.5 text-sm font-semibold">Enquiry type<select className={field} value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(([value,text])=><option value={value} key={value}>{text}</option>)}</select></label>
     <label className="space-y-1.5 text-sm font-semibold">Order reference (optional)<input className={field} maxLength={80} placeholder="Not a verification code" value={orderReference} onChange={e=>setOrderReference(e.target.value)}/></label>
     <label className="space-y-1.5 text-sm font-semibold">Preferred response<select className={field} value={preferredContact} onChange={e=>setPreferredContact(e.target.value)}><option value="phone">Phone callback</option><option value="email" disabled={!email.trim()}>Email</option></select></label>
    </div>
    <label className="block space-y-1.5 text-sm font-semibold">How can we help?
      <textarea rows={5} minLength={12} maxLength={2000} required value={message} onChange={e=>setMessage(e.target.value)}
       className="w-full resize-y rounded-xl border bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Describe the issue. Do not include passwords, verification codes or card details."/>
    </label>
    <label className="flex items-start gap-3 text-sm leading-6">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required className="mt-1 size-5"/>
      <span>I agree that Variety Groceries may use these contact details to respond to my enquiry. See the <Link href="/privacy" className="font-bold text-primary underline">privacy information</Link>.</span>
    </label>
    {error?<p ref={errorRef} tabIndex={-1} role="alert" className="scroll-mt-28 rounded-lg border border-destructive/50 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive">{error}</p>:null}
    <button type="submit" disabled={busy||!consent} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white disabled:opacity-50"><PhoneCall className="size-5"/>{busy?"Recording your request…":"Request a response"}</button>
    <p className="text-xs leading-5 text-muted-foreground">No guaranteed callback time. For order status, use <Link href="/track" className="font-semibold text-primary underline">verified tracking</Link>. We will not initiate an order change solely from this message.</p>
   </form>}
 </main>;
}
