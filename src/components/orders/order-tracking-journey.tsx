"use client";
import type { PublicOrder } from "@/services/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDashed, Clock3, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { order: PublicOrder; compact?: boolean; onRefresh?: () => void | Promise<void>; refreshing?: boolean };

/** Single customer-safe presentation shared across checkout, account and guest tracking. */
export function OrderTrackingJourney({ order, compact = false, onRefresh, refreshing = false }: Props) {
  const journey = order.trackingJourney;
  const steps = journey ? journey.milestones : order.events.map((e, index) => ({
    id: "legacy-" + index, title: e.action.replace(/[._-]+/g, " "),
    at: e.at, status: "complete" as const,
    detail: undefined as string | undefined, locationLabel: undefined as string | undefined,
  }));
  const rendered = compact ? steps.slice(-6) : steps;
  return <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="Order journey">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><Truck className="size-4 text-primary" aria-hidden />Your order journey</h3>
        {journey ? <div className="mt-2" aria-live="polite">
          <p className="text-sm font-semibold">{journey.headline}</p>
          {journey.detail ? <p className="mt-1 text-sm text-muted-foreground">{journey.detail}</p> : null}
          {journey.currentLocationLabel ? <p className="mt-1 text-sm">Current facility: <strong>{journey.currentLocationLabel}</strong></p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Last confirmed update: {formatDateTime(journey.updatedAt)} UTC</p>
        </div> : null}
      </div>
      {onRefresh ? <Button variant="outline" type="button" size="sm" disabled={refreshing}
        onClick={() => void onRefresh()} aria-label="Refresh order journey">
        <RefreshCw className={cn("mr-1.5 size-4", refreshing && "animate-spin")} aria-hidden />{refreshing ? "Refreshing…" : "Refresh"}
      </Button> : null}
    </div>
    <ol className="mt-4 space-y-3" aria-label="Journey milestones">
      {rendered.length ? rendered.map(step => <li key={step.id} className="flex items-start gap-3 text-sm">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
          step.status === "planned" ? "border-dashed text-muted-foreground" :
          step.status === "current" ? "border-primary bg-primary/10 text-primary" : "border-success/40 bg-success/10 text-success")} aria-hidden>
          {step.status === "planned" ? <CircleDashed className="size-4" /> :
           step.status === "current" ? <Clock3 className="size-4" /> : <CheckCircle2 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", step.status === "planned" && "text-muted-foreground")}>{step.title}</p>
          {step.status === "planned" ? <p className="text-xs text-muted-foreground">Planned · not yet confirmed</p> : null}
          {step.detail ? <p className="text-muted-foreground">{step.detail}</p> : null}
          {step.locationLabel ? <p className="text-muted-foreground">Facility: {step.locationLabel}</p> : null}
          {step.status !== "planned" ? <time dateTime={step.at} className="block text-xs text-muted-foreground">
            {formatDateTime(step.at)} UTC
          </time> : null}
        </div>
      </li>) : <li className="text-sm text-muted-foreground">No confirmed updates yet.</li>}
    </ol>
    <p className="mt-4 text-xs text-muted-foreground">Only confirmed updates are shown; this is not live GPS tracking or an arrival-time prediction.</p>
  </section>;
}
