"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { groundedShoppingAnswer } from "./grounded-catalog";
import { formatMoney } from "@/lib/money";
import type { AssistantResponse } from "@/services/client";

interface Recognition {
  lang:string; continuous:boolean; interimResults:boolean;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
  onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
  start():void;stop():void;abort():void;
}
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
type Message={who:"customer"|"assistant";text:string;answer?:AssistantResponse};
export function CustomerVoiceConcierge(){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false);
 const [messages,setMessages]=useState<Message[]>([]);
 const [speechCapable,setSpeechCapable]=useState(false),[listening,setListening]=useState(false);
 const [readAloud,setReadAloud]=useState(false),[error,setError]=useState("");
 const recognition=useRef<Recognition|null>(null);
 const scrollRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{const w=window as SpeechWindow;setSpeechCapable(Boolean(w.SpeechRecognition||w.webkitSpeechRecognition));return()=>{recognition.current?.abort();window.speechSynthesis?.cancel();};},[]);
 useEffect(()=>{if(open)scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"});},[open,messages,busy]);
 const say=(text:string)=>{if(!("speechSynthesis" in window))return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang="en-GH";utterance.rate=0.95;window.speechSynthesis.speak(utterance);};
 const submit=async(value:string)=>{
   const q=value.trim().slice(0,400);if(!q||busy)return;
   setError("");setBusy(true);setDraft("");setMessages(old=>[...old.slice(-12),{who:"customer",text:q}]);
   try{const answer=await groundedShoppingAnswer(q);setMessages(old=>[...old,{who:"assistant",text:answer.answer,answer}]);if(readAloud)say(answer.answer);}
   catch{setError("I could not verify the catalogue just now. Your question was not submitted as an order.");}
   finally{setBusy(false);}
 };
 const toggleMic=()=>{
   if(listening){recognition.current?.stop();setListening(false);return;}
   const w=window as SpeechWindow;const Speech=w.SpeechRecognition||w.webkitSpeechRecognition;
   if(!Speech){setError("Speech recognition is not available in this browser. Please type your question.");return;}
   try{
     const rec=new Speech();recognition.current=rec;rec.lang="en-GH";rec.continuous=false;rec.interimResults=false;
     rec.onresult=(event)=>{const said=event.results[0]?.[0]?.transcript?.trim();if(said)void submit(said);};
     rec.onerror=(event)=>{setError(event.error==="not-allowed"?"Microphone permission was denied. You can still type your question.":"I could not understand the speech. Try again or type it.");};
     rec.onend=()=>setListening(false);rec.start();setError("");setListening(true);
   }catch{setListening(false);setError("The microphone could not start. You can type instead.");}
 };
 return <div className="fixed bottom-20 right-3 z-[60] md:bottom-6 md:right-6">
   {open?<section role="dialog" aria-label="Variety Groceries shopping assistant" className="flex max-h-[min(75dvh,640px)] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
     <header className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
       <div><h2 className="text-base font-bold">Variety Groceries Assistant</h2><p className="text-xs opacity-85">Catalogue-grounded chat and optional voice</p></div>
       <button type="button" onClick={()=>{setOpen(false);recognition.current?.stop();window.speechSynthesis?.cancel();}} className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline-2" aria-label="Close assistant"><X className="size-5"/></button>
     </header>
     <div ref={scrollRef} className="min-h-40 flex-1 space-y-3 overflow-y-auto bg-[#f7f9f5] p-3" aria-live="polite" aria-relevant="additions">
       {!messages.length?<div className="space-y-3 text-sm"><p className="font-semibold">How can I help you shop today?</p><p className="text-muted-foreground">Ask about available groceries and prices. For private order details, use verified order tracking.</p>
         <div className="flex flex-wrap gap-2">{["Rice","Cooking oil","Tomatoes"].map(q=><button key={q} type="button" onClick={()=>void submit(q)} className="rounded-full border bg-white px-3 py-2 text-xs hover:border-primary">{q}</button>)}</div>
       </div>:messages.map((m,i)=><div key={i} className={"max-w-[95%] rounded-xl p-3 text-sm "+(m.who==="customer"?"ml-auto bg-primary text-primary-foreground":"mr-auto border bg-white")}>
         <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
         {m.answer?.suggestions.length?<ul className="mt-2 space-y-2 border-t pt-2">{m.answer.suggestions.map(p=><li key={p.variantId} className="flex items-center justify-between gap-2"><span className="min-w-0 flex-1 text-xs">{p.label} — {formatMoney(p.priceMinor)}</span><Link className="shrink-0 rounded-lg bg-primary px-2 py-1.5 text-xs font-semibold text-white" href={"/shop?query="+encodeURIComponent(p.label.split(" — ")[0])}>View</Link></li>)}</ul>:null}
       </div>)}
       {busy?<p className="text-xs text-muted-foreground" role="status">Checking the latest catalogue…</p>:null}
     </div>
     <div className="border-t bg-white p-3">
       {error?<p role="alert" className="mb-2 text-xs text-destructive">{error}</p>:null}
       <div className="mb-2 flex items-center justify-between gap-2 text-xs">
         <div className="flex gap-3"><Link href="/track" className="font-semibold text-primary underline">Track order</Link><Link href="/support" className="font-semibold text-primary underline">Request human callback</Link></div>
         <button type="button" className="inline-flex items-center gap-1 rounded p-1.5 hover:bg-muted" onClick={()=>{setReadAloud(v=>!v);window.speechSynthesis?.cancel();}} aria-pressed={readAloud}>
           {readAloud?<Volume2 className="size-4"/>:<VolumeX className="size-4"/>}{readAloud?"Voice on":"Read aloud off"}
         </button>
       </div>
       <form className="flex items-center gap-2" onSubmit={e=>{e.preventDefault();void submit(draft);}}>
         <label htmlFor="concierge-question" className="sr-only">Your grocery question</label>
         <input id="concierge-question" maxLength={400} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ask about groceries…" className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"/>
         <button type="button" onClick={toggleMic} disabled={!speechCapable||busy} aria-label={listening?"Stop listening":"Speak a question"} aria-pressed={listening} className="flex size-11 shrink-0 items-center justify-center rounded-xl border disabled:opacity-40">{listening?<MicOff className="size-5 text-red-600"/>:<Mic className="size-5"/>}</button>
         <button type="submit" disabled={busy||!draft.trim()} aria-label="Send question" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-50"><Send className="size-5"/></button>
       </form>
       <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Catalogue guidance, not a human or connected generative AI. No checkout actions are taken. Speech recognition may use your browser provider's service.</p>
     </div>
   </section>:<button type="button" onClick={()=>setOpen(true)} className="flex min-h-12 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-xl hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Open grocery chat and voice assistant"><MessageCircle className="size-5"/> Ask or speak</button>}
 </div>;
}
