"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { canOfferPickupCollection, shipmentCurrentStop, validPickupProof } from "./pickup-collection-policy";
import type {
  ShipmentListItem, ShipmentDetailView, ShipmentStatus,
  PickupCollectRequest, PickupCollectResponse,
} from "@/services/contracts";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, MapPin, PackageCheck, RefreshCw, Search, ShieldCheck, Truck, Warehouse } from "lucide-react";

type StatusFilter = "all" | ShipmentStatus;
const PER_PAGE = 20;
const labels: Record<ShipmentStatus, string> = {
  planned: "Planned", at_node: "At facility", in_transit: "In transit",
  final_mile_ready: "Final-mile ready", final_mile: "Final mile",
  ready_for_pickup: "Ready for pickup", completed: "Completed", exception: "Exception",
};
const filters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All shipments" }, { value: "ready_for_pickup", label: "Ready for pickup" },
  { value: "at_node", label: "At facility" }, { value: "in_transit", label: "In transit" },
  { value: "final_mile_ready", label: "Final-mile ready" }, { value: "completed", label: "Completed" },
  { value: "exception", label: "Exceptions" },
];
const initialProof = (): PickupCollectRequest => ({
  receiverName: "", verificationCode: "", identityCheck: "recipient_photo_id_checked",
});
const readable = (name: string) => name.replaceAll("_", " ");
function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge variant={status === "exception" ? "destructive"
    : status === "ready_for_pickup" ? "default"
    : status === "completed" ? "secondary" : "outline"}>{labels[status]}</Badge>;
}

export function ShipmentsPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusFilter>("ready_for_pickup");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useApiData(() => apiOps.logisticsShipments({
    page, perPage: PER_PAGE, ...(status === "all" ? {} : { status }),
  }), [page, status]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ShipmentDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailSequence = useRef(0);
  const [collectTarget, setCollectTarget] = useState<ShipmentDetailView | null>(null);
  const [proof, setProof] = useState<PickupCollectRequest>(initialProof);
  const [acknowledged, setAcknowledged] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PickupCollectResponse | null>(null);
  const replayKey = useRef("");

  const rows = useMemo(() => (data?.items ?? []).filter(row => row.orderReference.toLowerCase().includes(search.trim().toLowerCase())), [data, search]);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PER_PAGE));

  async function openDetail(id: string) {
    const request = ++detailSequence.current;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const result = await apiOps.logisticsShipment(id);
      if (detailSequence.current === request) setDetail(result);
    } catch (e) {
      if (detailSequence.current === request) setDetailError(e instanceof ApiError ? e.message : "Could not load the shipment.");
    } finally {
      if (detailSequence.current === request) setDetailLoading(false);
    }
  }

  function closeDetail(open: boolean) {
    setDetailOpen(open);
    if (!open) {
      detailSequence.current++;
      setDetail(null);
      setDetailError(null);
    }
  }

  function beginCollection() {
    if (!detail || !canOfferPickupCollection(detail)) return;
    replayKey.current = crypto.randomUUID();
    setProof(initialProof());
    setAcknowledged(false);
    setCollectionError(null);
    setReceipt(null);
    setCollectTarget(detail);
    closeDetail(false);
  }

  function changeProof(next: PickupCollectRequest) {
    setProof(next);
    setCollectionError(null);
    // A changed payload must use a new key. Unchanged retries keep the same key.
    replayKey.current = crypto.randomUUID();
  }

  function closeCollection(open: boolean) {
    if (collecting) return;
    if (!open) {
      setCollectTarget(null);
      setProof(initialProof());
      setAcknowledged(false);
      setCollectionError(null);
      setReceipt(null);
      replayKey.current = "";
      return;
    }
  }

  async function submitCollection() {
    if (!collectTarget || collecting || receipt || !canOfferPickupCollection(collectTarget) ||
        !validPickupProof(proof, acknowledged)) return;
    setCollecting(true);
    setCollectionError(null);
    try {
      const result = await apiOps.logisticsShipmentCollect(collectTarget.id, {
        receiverName: proof.receiverName.trim(),
        verificationCode: proof.verificationCode.toUpperCase().trim(),
        identityCheck: proof.identityCheck,
      }, replayKey.current);
      if (result.shipmentId !== collectTarget.id || result.status !== "completed") {
        throw new ApiError("BAD_RESPONSE", "Collection response does not match the selected shipment.");
      }
      // Clear personal/secret inputs immediately, even while the receipt stays visible.
      setProof(initialProof());
      setAcknowledged(false);
      setReceipt(result);
      toast({ title: "Collection verified", description: `Receipt recorded for ${result.orderReference}.` });
      // A failed queue refresh cannot undo a successfully committed collection.
      void reload();
    } catch (e) {
      setCollectionError(e instanceof ApiError ? e.message : "Collection could not be verified. Review the shipment before retrying.");
    } finally {
      setCollecting(false);
    }
  }

  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link href="/admin/logistics"><ArrowLeft className="size-4" aria-hidden /> Logistics configuration</Link>
        </Button>
        <h1 className="font-serif text-2xl font-bold">Shipments &amp; customer collection</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review recorded parcel movements. Collection is available only after the server confirms
          the parcel is physically at its configured pickup centre.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
        <RefreshCw className="size-4" aria-hidden /> Refresh queue
      </Button>
    </div>

    <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
      <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Collection requires an authenticated administrator, a confirmed electronic payment,
        the customer&apos;s order verification code and physical photo-ID inspection.
        The system will never create a payment or deduct inventory at collection.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <Summary icon={PackageCheck} label="Shipments in current filter" value={String(data?.total ?? "—")} />
      <Summary icon={Truck} label="Current page" value={data ? `${data.page} of ${totalPages}` : "—"} />
      <Summary icon={Warehouse} label="Collection authority" value="Server-controlled" />
    </div>

    <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4" aria-label="Shipment queue">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[190px] flex-1 sm:flex-none sm:w-64">
          <Label htmlFor="shipment-status-filter">Shipment status</Label>
          <Select value={status} onValueChange={value => { setStatus(value as StatusFilter); setPage(1); }}>
            <SelectTrigger className="mt-1" id="shipment-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>{filters.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="min-w-[190px] flex-1">
          <Label htmlFor="shipment-reference-search">Find order reference on this page</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input id="shipment-reference-search" className="pl-9" placeholder="Order reference" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {error ? <div className="mt-4"><ErrorState message={error} onRetry={reload} /></div>
        : loading ? <LoadingState rows={5} label="Loading verified shipment records" />
        : !rows.length ? <div className="mt-4"><EmptyState icon={PackageCheck} title="No shipment records in this view"
          description={search ? "No matching order reference on this page. Clear the search or change the filter."
            : "No committed shipments match this filter. Demo mode does not create simulated parcel movements or receipts."} /></div>
        : <div className="mt-4 space-y-2">
          {rows.map(row => <ShipmentRow key={row.id} row={row} onOpen={() => void openDetail(row.id)} />)}
        </div>}

      {data && data.total > 0 ? <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {data.total} recorded shipments · {Math.min((data.page - 1) * PER_PAGE + 1, data.total)}–{Math.min(data.page * PER_PAGE, data.total)} displayed
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>
            <ArrowLeft className="size-4" aria-hidden /> Previous
          </Button>
          <Button size="sm" variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div> : null}
    </section>

    <Dialog open={detailOpen} onOpenChange={closeDetail}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Shipment details</DialogTitle>
          <DialogDescription>Recorded route and custody evidence, not estimated delivery progress.</DialogDescription>
        </DialogHeader>
        {detailLoading ? <LoadingState rows={4} label="Loading shipment evidence" /> : detailError
          ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{detailError}</p>
          : detail ? <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-lg font-semibold">{detail.orderReference}</p>
                <p className="text-xs text-muted-foreground">Route revision {detail.routeRevision}</p></div>
              <ShipmentStatusBadge status={detail.status} />
            </div>
            <div className="grid gap-3 rounded-xl bg-muted/35 p-3 sm:grid-cols-2">
              <Info label="Destination" value={detail.destinationKind === "pickup_point" ? "Pickup centre" : "Doorstep delivery"} />
              <Info label="Current facility" value={shipmentCurrentStop(detail) ?? (detail.currentLegId ? "Between facilities" : detail.completedAt ? "Customer / completed" : "Not yet recorded")} />
              <Info label="Custody" value={detail.custody ? readable(detail.custody) : "Not handed over"} />
              <Info label="Activated" value={detail.activatedAt ? formatDateTime(detail.activatedAt) + " UTC" : "Not handed over"} />
            </div>
            <div>
              <h3 className="font-semibold">Route stops</h3>
              <ol className="mt-2 space-y-2">{detail.stops.filter(s => s.routeRevision === detail.routeRevision).map(stop =>
                <li key={stop.id} className="flex gap-3 rounded-lg border p-3 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0"><p className="font-medium">{stop.nodePublicName}</p>
                    <p className="text-xs text-muted-foreground">Stop {stop.position} · {readable(stop.terminalRole)}</p></div>
                </li>)}</ol>
            </div>
            <div>
              <h3 className="font-semibold">Committed events</h3>
              {detail.events.length ? <ol className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
                {detail.events.slice().reverse().map(event => <li key={event.id} className="border-b pb-2 last:border-none last:pb-0">
                  <p className="font-medium">{readable(event.eventKind)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)} UTC</p>
                </li>)}
              </ol> : <p className="mt-2 text-sm text-muted-foreground">No physical events recorded.</p>}
            </div>
            {detail.blockers.length ? <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Current constraints: {detail.blockers.map(readable).join(", ")}.
            </p> : null}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button asChild variant="outline"><Link href={`/admin/orders/${encodeURIComponent(detail.orderId)}`}>View order</Link></Button>
              {canOfferPickupCollection(detail) ?
                <Button onClick={beginCollection}><ClipboardCheck className="size-4" aria-hidden /> Verify customer collection</Button>
                : <p className="self-center text-xs text-muted-foreground">Collection action is unavailable until server requirements are met.</p>}
            </DialogFooter>
          </div> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(collectTarget)} onOpenChange={closeCollection}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{receipt ? "Collection confirmed" : "Verify physical customer collection"}</DialogTitle>
          <DialogDescription>
            {receipt ? "This is a recorded collection receipt, not a payment confirmation."
              : `Order ${collectTarget?.orderReference ?? ""}. Confirm the receiver's identity before handing over the parcel.`}
          </DialogDescription>
        </DialogHeader>
        {receipt ? <div className="space-y-3" role="status" aria-live="polite">
          <CheckCircle2 className="size-10 text-success" aria-hidden />
          <p className="font-semibold">Parcel collected successfully</p>
          <Info label="Order" value={receipt.orderReference} />
          <Info label="Receipt ID" value={receipt.receiptId} />
          <Info label="Recorded at" value={formatDateTime(receipt.collectedAt) + " UTC"} />
          <p className="text-xs text-muted-foreground">The verification code and receiver details are not displayed in this receipt response.</p>
          <Button className="w-full" onClick={() => closeCollection(false)}>Done</Button>
        </div> : <div className="space-y-4">
          <div>
            <Label htmlFor="collection-name">Receiver&apos;s full name</Label>
            <Input id="collection-name" autoComplete="off" maxLength={160}
              value={proof.receiverName} onChange={e => changeProof({ ...proof, receiverName: e.target.value })}
              placeholder="Name shown on photo ID" className="mt-1" disabled={collecting} />
          </div>
          <div>
            <Label htmlFor="collection-code">Customer&apos;s 10-character order verification code</Label>
            <Input id="collection-code" autoComplete="off" autoCapitalize="characters" type="password"
              maxLength={10} spellCheck={false} className="mt-1 font-mono tracking-wider"
              value={proof.verificationCode} onChange={e => changeProof({ ...proof, verificationCode: e.target.value.toUpperCase().replace(/\s/g, "") })}
              placeholder="Enter code" disabled={collecting} />
            <p className="mt-1 text-xs text-muted-foreground">Ask the receiver to provide the original order code. Do not save or share it outside this verification.</p>
          </div>
          <div>
            <Label htmlFor="collection-identity">Identity verification performed</Label>
            <Select value={proof.identityCheck} disabled={collecting}
              onValueChange={v => changeProof({ ...proof, identityCheck: v as PickupCollectRequest["identityCheck"] })}>
              <SelectTrigger id="collection-identity" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recipient_photo_id_checked">Recipient photo ID checked</SelectItem>
                <SelectItem value="authorized_representative_photo_id_checked">Authorised representative photo ID checked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox id="collection-confirm" checked={acknowledged} disabled={collecting}
              onCheckedChange={v => setAcknowledged(v === true)} />
            <Label htmlFor="collection-confirm" className="cursor-pointer text-sm leading-relaxed">
              I am physically present at this pickup centre, have inspected the receiver&apos;s photo ID,
              and confirm that the parcel is being handed to this person now.
            </Label>
          </div>
          {collectionError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {collectionError} If the request timed out, refresh the shipment queue before attempting another collection.
          </p> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={collecting} onClick={() => closeCollection(false)}>Cancel</Button>
            <Button disabled={collecting || !validPickupProof(proof, acknowledged)} onClick={() => void submitCollection()}>
              <ShieldCheck className="size-4" aria-hidden /> {collecting ? "Verifying…" : "Verify & record collection"}
            </Button>
          </DialogFooter>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}

function Summary({ icon: Icon, label, value }: {
  icon: typeof PackageCheck; label: string; value: string;
}) {
  return <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-5 text-muted-foreground" aria-hidden /></span>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-base font-semibold">{value}</p></div>
  </div>;
}

function ShipmentRow({ row, onOpen }: { row: ShipmentListItem; onOpen: () => void }) {
  return <article className="min-w-0 rounded-xl border p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words font-semibold">{row.orderReference}</p>
          <ShipmentStatusBadge status={row.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{row.destinationKind === "pickup_point" ? "Customer pickup centre" : "Doorstep delivery"}</span>
          <span>Route revision {row.routeRevision}</span>
          <span>Updated {formatDateTime(row.updatedAt)} UTC</span>
        </div>
      </div>
      <Button type="button" variant={canOfferPickupCollection(row) ? "default" : "outline"} size="sm" onClick={onOpen}>
        {canOfferPickupCollection(row) ? "Review collection" : "View details"}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  </article>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p>
    <p className="break-words text-sm font-medium">{value}</p></div>;
}
