"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { PickupAppointmentPolicyInput, PickupAppointmentPolicyView } from "@/services/contracts";
import { pickupAppointmentPolicyInputSchema } from "@/services/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PickupCentreClosureCalendar } from "./pickup-centre-closure-calendar";

const days = [
  {value:1,label:"Mon"}, {value:2,label:"Tue"}, {value:3,label:"Wed"},
  {value:4,label:"Thu"}, {value:5,label:"Fri"}, {value:6,label:"Sat"}, {value:7,label:"Sun"},
];
const draftPolicy = (): PickupAppointmentPolicyInput => ({
  active:false,serviceDays:[1,2,3,4,5,6],opensAt:"09:00",closesAt:"17:00",
  slotMinutes:30,capacity:4,minLeadMinutes:60,maxDaysAhead:7,
});

export function PickupAppointmentPolicyEditor({nodeId,nodeName}:{nodeId:string;nodeName:string}) {
  const [open,setOpen] = useState(false);
  const [loading,setLoading] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [saving,setSaving] = useState(false);
  const [policy,setPolicy] = useState<PickupAppointmentPolicyInput>(draftPolicy);
  const [existing,setExisting] = useState<PickupAppointmentPolicyView|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);

  useEffect(()=>{
    if(!open)return;
    let active=true;
    apiOps.pickupAppointmentPolicy(nodeId).then(result=>{
      if(!active)return;
      setExisting(result);
      setLoaded(true);
      setPolicy(result?{
        active:result.active,serviceDays:result.serviceDays,opensAt:result.opensAt,closesAt:result.closesAt,
        slotMinutes:result.slotMinutes,capacity:result.capacity,
        minLeadMinutes:result.minLeadMinutes,maxDaysAhead:result.maxDaysAhead,
      }:draftPolicy());
      setError(null);setLoading(false);
    }).catch(err=>{
      if(active){setLoaded(false);setLoading(false);setError(err instanceof ApiError?err.message:"Could not load pickup schedule.");}
    });
    return ()=>{active=false;};
  },[open,nodeId]);

  async function save() {
    if(saving||!loaded)return;
    setError(null);setNotice(null);
    const validated=pickupAppointmentPolicyInputSchema.safeParse(policy);
    if(!validated.success){
      setError(validated.error.issues.map(i=>i.message).join("; "));return;
    }
    setSaving(true);
    try {
      const updated=await apiOps.pickupAppointmentPolicySave(nodeId,validated.data,crypto.randomUUID());
      setExisting(updated);
      setNotice("Collection centre appointment policy saved. Customer appointment availability is still controlled by the server's remote-pickup release flags.");
    } catch(err){
      setError(err instanceof ApiError?err.message:"Could not save collection appointment policy.");
    } finally {setSaving(false);}
  }

  return <Dialog open={open} onOpenChange={v=>{if(!saving){setOpen(v);if(v){setLoading(true);setLoaded(false);setNotice(null);setError(null);}}}}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm"><CalendarClock className="size-4" aria-hidden /> Appointment hours</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Customer collection appointments</DialogTitle>
        <DialogDescription>
          {nodeName}. Configure customer visits after a parcel is recorded ready for pickup.
          These settings are separate from delivery transport slots and never activate remote pickup by themselves.
        </DialogDescription>
      </DialogHeader>
      {loading?<p role="status" className="text-sm text-muted-foreground">Loading centre schedule…</p>:!loaded?
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error ?? "The centre policy could not be verified."} Close and reopen to retry; no schedule changes were made.
        </p>:<>
        {error?<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>:null}
        {notice?<p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">{notice}</p>:null}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="font-medium">Allow customer appointment booking</p>
            <p className="text-xs text-muted-foreground">Disabled by default. Does not override deployment flags.</p>
          </div>
          <Switch checked={policy.active} disabled={saving} onCheckedChange={active=>setPolicy(p=>({...p,active}))} aria-label="Enable appointments for this centre"/>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Open days · Ghana local time (GMT)</legend>
          <div className="flex flex-wrap gap-2">
            {days.map(day=><Button key={day.value} type="button" size="sm"
              variant={policy.serviceDays.includes(day.value)?"default":"outline"} aria-pressed={policy.serviceDays.includes(day.value)}
              disabled={saving} onClick={()=>setPolicy(p=>({...p,serviceDays:p.serviceDays.includes(day.value)
                ?p.serviceDays.filter(d=>d!==day.value)
                :[...p.serviceDays,day.value].sort((a,b)=>a-b)}))}>{day.label}</Button>)}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="pickup-policy-opens">Opens</Label>
            <Input id="pickup-policy-opens" type="time" step={1800} className="mt-1" value={policy.opensAt} disabled={saving}
              onChange={e=>setPolicy(p=>({...p,opensAt:e.target.value}))}/></div>
          <div><Label htmlFor="pickup-policy-closes">Closes</Label>
            <Input id="pickup-policy-closes" type="time" step={1800} className="mt-1" value={policy.closesAt} disabled={saving}
              onChange={e=>setPolicy(p=>({...p,closesAt:e.target.value}))}/></div>
          <div><Label htmlFor="pickup-policy-duration">Appointment length (minutes)</Label>
            <select id="pickup-policy-duration" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={saving}
              value={policy.slotMinutes} onChange={e=>setPolicy(p=>({...p,slotMinutes:Number(e.target.value) as 30|60}))}>
              <option value={30}>30 minutes</option><option value={60}>60 minutes</option>
            </select></div>
          <div><Label htmlFor="pickup-policy-capacity">People per appointment slot (1–50)</Label>
            <Input id="pickup-policy-capacity" type="number" min={1} max={50} className="mt-1" disabled={saving}
              value={policy.capacity} onChange={e=>setPolicy(p=>({...p,capacity:Number(e.target.value)}))}/></div>
          <div><Label htmlFor="pickup-policy-lead">Minimum notice (minutes, 30–1440)</Label>
            <Input id="pickup-policy-lead" type="number" min={30} max={1440} className="mt-1" disabled={saving}
              value={policy.minLeadMinutes} onChange={e=>setPolicy(p=>({...p,minLeadMinutes:Number(e.target.value)}))}/></div>
          <div><Label htmlFor="pickup-policy-horizon">Book days ahead (1–14)</Label>
            <Input id="pickup-policy-horizon" type="number" min={1} max={14} className="mt-1" disabled={saving}
              value={policy.maxDaysAhead} onChange={e=>setPolicy(p=>({...p,maxDaysAhead:Number(e.target.value)}))}/></div>
        </div>
        <p className="text-xs text-muted-foreground">
          Only whole 30- or 60-minute appointments fit within the centre&apos;s hours.
          Overnight hours are not supported. Existing bookings remain recorded if you later disable this policy.
        </p>
        <PickupCentreClosureCalendar nodeId={nodeId} />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={saving} onClick={()=>setOpen(false)}>Close</Button>
          <Button disabled={saving||!loaded} onClick={()=>void save()}>
            {saving?"Saving…":existing?"Update appointment policy":"Save appointment policy"}
          </Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
