import type { PublicOrder } from "@/services/contracts";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { Clock3, MapPin, PackageCheck, ShieldCheck } from "lucide-react";

type Props = { order: PublicOrder };

/**
 * Display ONLY the order-time public pickup snapshot, not mutable admin data.
 * The shipment timeline remains the authority for actual arrival/collection.
 */
export function PickupCentreDetails({ order }: Props) {
  const point = order.pickupPoint;
  if (!point) return null;
  const ready = order.trackingJourney?.source === "shipment" &&
    order.trackingJourney.state === "ready_for_pickup";
  const collected = order.trackingJourney?.source === "shipment" &&
    order.trackingJourney.state === "collected";

  return (
    <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-label="Selected pickup centre">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 className="font-semibold">Your selected pickup centre</h3>
          <p className="mt-1 break-words text-base font-medium">{point.name}</p>
          {[point.addressLine, [point.locality, point.region].filter(Boolean).join(", "), point.ghanaPostGps]
            .filter(Boolean).map((line, i) => <p key={i} className="break-words text-sm text-muted-foreground">{line}</p>)}
          {point.directions ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">Directions: {point.directions}</p> : null}
          {point.contact ? <p className="mt-1 break-words text-sm">Centre contact: {point.contact}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Pickup transport charge at checkout</p>
          <p className="font-semibold tabular-nums">
            {point.feeMinor === 0 ? "Free" : formatMoney(point.feeMinor)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({point.feeBasis === "centre_pickup" ? "centre rate" : "delivery-zone rate"})
            </span>
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden /> Transport window
          </p>
          <p className="font-medium">
            {point.transportWindow
              ? `${formatDateTime(point.transportWindow.startsAt)}–${formatDateTime(point.transportWindow.endsAt)} UTC`
              : "No transport window selected"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">This is not a customer collection appointment.</p>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-muted/45 p-3 text-sm">
        {ready || collected ? <PackageCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> :
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <p>
          {ready ? "The shipment has arrived and is ready at its pickup centre. Bring your order code and valid photo ID."
            : collected ? "Collection has been recorded by the pickup centre."
              : "Wait for a confirmed Ready for collection update before travelling to the centre."}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        These location and price details were captured when the order was placed. Shipment updates below
        reflect recorded events, not predicted arrival times.
      </p>
    </section>
  );
}
