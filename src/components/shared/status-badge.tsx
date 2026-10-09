import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DELIVERY_LABELS,
  FULFILMENT_LABELS,
  PAYMENT_LABELS,
  REFUND_LABELS,
  RETURN_LABELS,
} from "@/types/domain";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/15 text-[color:var(--warning-foreground)] border-warning/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-primary/10 text-primary border-primary/30",
  outline: "bg-transparent text-muted-foreground border-border",
};

/** Maps a domain status to a consistent badge tone across every screen. */
export function statusTone(kind: "payment" | "fulfilment" | "delivery" | "return" | "refund" | "generic", status: string): Tone {
  const s = status as never;
  switch (kind) {
    case "payment":
      if (s === "succeeded" || s === "settled") return "success";
      if (s === "pending" || s === "initiated" || s === "processing" || s === "refund_pending") return "warning";
      if (s === "failed" || s === "expired") return "danger";
      if (s === "requires_review" || s === "exception") return "info";
      if (s === "refunded") return "neutral";
      if (s === "partially_refunded") return "warning";
      return "neutral";
    case "fulfilment":
      if (s === "delivered" || s === "collected") return "success";
      if (s === "picking" || s === "packed" || s === "dispatched") return "info";
      if (s === "ready_for_collection" || s === "confirmed") return "warning";
      if (s === "cancelled") return "danger";
      return "neutral";
    case "delivery":
      if (s === "delivered") return "success";
      if (s === "out_for_delivery" || s === "picked_up") return "info";
      if (s === "failed" || s === "return_to_store") return "danger";
      if (s === "rescheduled") return "warning";
      return "neutral";
    case "return":
      if (s === "resolved") return "success";
      if (s === "rejected") return "danger";
      if (s === "inspected" || s === "received") return "info";
      return "warning";
    case "refund":
      if (s === "succeeded") return "success";
      if (s === "failed") return "danger";
      if (s === "requires_review") return "info";
      if (s === "processing") return "warning";
      return "neutral";
    default:
      if (["active", "open", "approved", "sent", "received", "available", "configured"].includes(status)) return "success";
      if (["pending", "pending_approval", "draft", "requested", "counting", "review", "awaiting_approval", "suggested"].includes(status)) return "warning";
      if (["failed", "rejected", "cancelled", "closed", "expired", "error"].includes(status)) return "danger";
      return "neutral";
  }
}

export function statusLabel(kind: "payment" | "fulfilment" | "delivery" | "return" | "refund", status: string): string {
  const maps = {
    payment: PAYMENT_LABELS,
    fulfilment: FULFILMENT_LABELS,
    delivery: DELIVERY_LABELS,
    return: RETURN_LABELS,
    refund: REFUND_LABELS,
  } as Record<string, Record<string, string>>;
  return maps[kind]?.[status] ?? status.replace(/_/g, " ");
}

export function StatusBadge({
  kind,
  status,
  label,
  className,
}: {
  kind: "payment" | "fulfilment" | "delivery" | "return" | "refund" | "generic";
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = statusTone(kind, status);
  const text = label ?? (kind !== "generic" ? statusLabel(kind as "payment", status) : status.replace(/_/g, " "));
  return (
    <Badge variant="outline" className={cn("font-medium whitespace-nowrap capitalize", TONES[tone], className)}>
      {text}
    </Badge>
  );
}
