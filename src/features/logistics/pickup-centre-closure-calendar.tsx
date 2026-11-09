"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarOff, RotateCcw } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { PickupCentreClosureView } from "@/services/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const localDay=(offset=0)=>{
  const day=new Date();
  day.setUTCDate(day.getUTCDate()+offset);
  return day.toISOString().slice(0,10);
};
function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Could not update the centre's closure calendar.";
}

/** The only editor for server-owned pickup-centre closures; no client-side fake slots. */
export function PickupCentreClosureCalendar({nodeId}:{nodeId:string}) {
  const [items,setItems]=useState<PickupCentreClosureView[]>([]);
  const [day,setDay]=useState(localDay);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [showAll,setShowAll]=useState(false);
  const key=useRef<{intent:string;value:string}|null>(null);

  useEffect(()=>{
    let active=true;
    apiOps.pickupCentreClosures(nodeId).then(list=>{
      if(active){setItems(list);setLoading(false);}
    }).catch(e=>{
      if(active){setLoading(false);setError(errorMessage(e));}
    });
    return ()=>{active=false;};
  },[nodeId]);

  async function save(date:string,closed:boolean,description:string|null) {
    if(busy)return;
    const intent=`${date}:${closed}:${description??""}`;
    if(key.current?.intent!==intent)key.current={intent,value:crypto.randomUUID()};
    setBusy(true);setError(null);setNotice(null);
    try {
      const row=await apiOps.pickupCentreClosureSave(nodeId,
        {date,closed,reason:description},key.current.value);
      key.current=null;
      setItems(old=>[...old.filter(x=>x.date!==row.date),row].sort((a,b)=>a.date.localeCompare(b.date)));
      setNotice(closed
        ?"Centre closed for this day. Existing bookings were checked on the server."
        :"Centre reopened. Opening hours and the pickup release flags still apply.");
      if(closed){setReason("");setDay(localDay());}
    }catch(e){
      setError(errorMessage(e));
    }finally{setBusy(false);}
  }

  const visible=showAll?items:items.slice(0,8);
  return <section className="min-w-0 space-y-3 border-t pt-4" aria-label="Pickup centre holiday closures">
    <div>
      <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarOff className="size-4" aria-hidden/> Holidays and closure dates</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Block customer collection appointments on specific dates (Ghana local time).
        A date with an existing booking cannot be closed until the booking is resolved.
        This does not cancel orders, reverse payments, or stop incoming transport.
      </p>
    </div>
    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_auto] sm:items-end">
      <div><Label htmlFor={`pickup-closure-date-${nodeId}`}>Closure date</Label>
        <Input id={`pickup-closure-date-${nodeId}`} type="date"
          min={localDay()} max={localDay(365)} className="mt-1" value={day}
          disabled={busy} onChange={e=>setDay(e.target.value)}/></div>
      <div><Label htmlFor={`pickup-closure-reason-${nodeId}`}>Reason (3–160 characters)</Label>
        <Input id={`pickup-closure-reason-${nodeId}`} className="mt-1"
          maxLength={160} placeholder="e.g. Public holiday" value={reason}
          disabled={busy} onChange={e=>setReason(e.target.value)}/></div>
      <Button className="min-h-10" disabled={busy||loading||reason.trim().length<3||!day||day<localDay()||day>localDay(365)}
        onClick={()=>void save(day,true,reason.trim())}>{busy?"Saving…":"Close date"}</Button>
    </div>
    {error?<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>:null}
    {notice?<p role="status" className="rounded-md bg-muted/50 p-3 text-sm">{notice}</p>:null}
    {loading?<p role="status" className="text-sm text-muted-foreground">Loading closure calendar…</p>:
      items.length===0?<p className="text-sm text-muted-foreground">No centre-specific closures scheduled.</p>:
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {visible.map(item=><div key={item.date}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{new Intl.DateTimeFormat("en-GH",{dateStyle:"medium",timeZone:"Africa/Accra"})
              .format(new Date(item.date+"T12:00:00Z"))} · {item.closed?"Closed":"Reopened"}</p>
            {item.reason?<p className="break-words text-xs text-muted-foreground">{item.reason}</p>:null}
          </div>
          {item.closed&&item.date>=localDay()?
            <Button variant="outline" size="sm" disabled={busy} onClick={()=>void save(item.date,false,null)}>
              <RotateCcw className="size-4" aria-hidden/> Reopen
            </Button>:null}
        </div>)}
        {items.length>8?<Button variant="ghost" className="w-full" size="sm" onClick={()=>setShowAll(v=>!v)}>
          {showAll?"Show fewer":`Show all ${items.length} calendar records`}
        </Button>:null}
      </div>}
  </section>;
}
