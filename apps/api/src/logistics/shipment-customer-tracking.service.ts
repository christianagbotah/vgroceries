import { Injectable } from "@nestjs/common";
import {
  customerTrackingJourneySchema,
  type CustomerTrackingJourney,
  type CustomerTrackingMilestone,
  type CustomerTrackingState,
} from "@variety/contracts";
import { Database } from "../database/database";

/**
 * Read-only public projection. This is deliberately independent of ShipmentQueryService:
 * never serialize admin Shipment/Stop/Leg data into a customer response.
 */
const EVENT_TITLES: Record<string, string> = {
  fulfilment_handed_over: "Packed order handed over for delivery",
  shipment_departed: "Your order left a delivery facility",
  shipment_arrived: "Your order reached a delivery facility",
  shipment_handover: "Parcel handed to the delivery partner",
  shipment_rerouted: "Delivery route updated",
  shipment_delayed: "Delivery progress delayed",
  ready_for_pickup: "Ready for collection",
  customer_collected: "Collected by customer",
  rider_assigned: "Delivery rider assigned",
  rider_accepted: "Delivery rider confirmed",
  rider_picked_up: "Rider collected your order",
  out_for_delivery: "Out for delivery",
  delivery_failed: "Delivery attempt unsuccessful",
  delivery_rescheduled: "Delivery rescheduled",
  delivered: "Delivered",
  returned_toward_store: "Delivery parcel returning to dispatch",
  returned_to_dispatch: "Delivery parcel returned to dispatch for another attempt",
};

const HEADLINES: Record<CustomerTrackingState, string> = {
  preparing: "Your order is being prepared",
  at_facility: "Your order is at a delivery facility",
  in_transit: "Your order is moving between delivery facilities",
  ready_for_delivery: "Your order is ready for final delivery",
  out_for_delivery: "Your order is out for delivery",
  delivery_exception: "Your delivery needs another attempt",
  ready_for_pickup: "Your order is ready for collection",
  delivered: "Your order has been delivered",
  collected: "Your order has been collected",
  returned_to_dispatch: "Your delivery has returned to dispatch for another attempt",
};

const text = (value: string | null | undefined, max: number): string | undefined => {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : undefined;
};
const iso = (date: Date) => date.toISOString();
const customerEventCopy = (kind: string, value: string | null | undefined, max: number): string | undefined => {
  const copy = text(value, max);
  if (!copy) return undefined;
  // Shipment checkpoints are informational; financial outcomes belong exclusively
  // to Payments/Refunds, even if a staff-entered note uses alternative wording.
  if (/\b(?:payment|payments|paid|unpaid|cash|refund|refunded|charge|charged|credit|credited|settled|settlement|remittance|remitted)\b/i.test(copy)) return undefined;
  if (kind !== "delivered" && /\bdelivered\b|delivery\s+complete/i.test(copy)) return undefined;
  return copy;
};
const mostRecentKind = (kinds: string[]): string | undefined =>
  kinds.slice().reverse().find((kind) => [
    "delivery_failed", "delivery_rescheduled", "returned_toward_store",
    "returned_to_dispatch", "out_for_delivery", "rider_picked_up",
    "shipment_handover", "rider_assigned", "rider_accepted", "delivered", "customer_collected",
  ].includes(kind));

export function trackingState(status: string, destinationKind: string, eventKinds: string[]): CustomerTrackingState {
  if (status === "completed") return destinationKind === "pickup_point" ? "collected" : "delivered";
  if (status === "planned") return "preparing";
  if (status === "in_transit") return "in_transit";
  if (status === "at_node") return "at_facility";
  if (status === "ready_for_pickup") return "ready_for_pickup";
  const latest = mostRecentKind(eventKinds);
  if (status === "final_mile_ready") {
    return latest === "returned_to_dispatch" ? "returned_to_dispatch" : "ready_for_delivery";
  }
  if (status === "final_mile") {
    if (["delivery_failed", "delivery_rescheduled", "returned_toward_store"].includes(latest ?? "")) {
      return "delivery_exception";
    }
    return "out_for_delivery";
  }
  return "preparing";
}

@Injectable()
export class ShipmentCustomerTrackingService {
  constructor(private readonly db: Database) {}

  async project(orderId: string): Promise<CustomerTrackingJourney | null> {
    const shipment = await this.db.shipment.findUnique({
      where: { orderId_sequence: { orderId, sequence: 1 } },
      include: {
        order: { select: { createdAt: true } },
        currentNode: { select: { customerVisible: true, publicName: true } },
        workflowVersion: {
          include: { stages: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
        },
        events: {
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: 120,
          include: { node: { select: { customerVisible: true, publicName: true } } },
        },
      },
    });
    if (!shipment) return null;

    const run = await this.db.fulfilmentRun.findUnique({
      where: { orderId },
      select: { confirmedAt: true, pickingStartedAt: true, packedAt: true, handedOverAt: true },
    });

    // A capped event tail is sufficient for presentation; sorting by actual times
    // makes retries and route-revision boundaries deterministic.
    const events = shipment.events.slice().reverse().sort((a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id)
    );
    const kinds = events.map((event) => event.eventKind);
    const state = trackingState(shipment.status, shipment.destinationKind, kinds);
    const currentLocationLabel = ["at_node", "final_mile_ready", "ready_for_pickup"].includes(shipment.status) &&
      shipment.currentNode?.customerVisible
      ? text(shipment.currentNode.publicName, 160)
      : undefined;

    const updatedAt = [
      shipment.order.createdAt,
      shipment.activatedAt,
      shipment.completedAt,
      run?.confirmedAt,
      run?.pickingStartedAt,
      run?.packedAt,
      run?.handedOverAt,
      ...events.map((event) => event.occurredAt),
    ].filter((date): date is Date => Boolean(date))
      .reduce((latest, next) => next.getTime() > latest.getTime() ? next : latest, shipment.order.createdAt);

    const facts = new Map<string, Date>();
    facts.set("order_placed", shipment.order.createdAt);
    for (const [kind, when] of [
      ["order_confirmed", run?.confirmedAt],
      ["picking_started", run?.pickingStartedAt],
      ["packed", run?.packedAt],
      ["fulfilment_handed_over", run?.handedOverAt],
    ] as Array<[string, Date | null | undefined]>) if (when) facts.set(kind, when);

    const firstEventForKind = new Map<string, number>();
    events.forEach((event, index) => {
      if (!firstEventForKind.has(event.eventKind)) firstEventForKind.set(event.eventKind, index);
      if (!facts.has(event.eventKind)) facts.set(event.eventKind, event.occurredAt);
    });

    const actual: Array<CustomerTrackingMilestone & { order: number }> = [];
    const planned: CustomerTrackingMilestone[] = [];
    const represented = new Set<number>();
    for (const [index, stage] of shipment.workflowVersion.stages.entries()) {
      if (!stage.customerVisible) continue;
      const title = text(stage.customerTitleTemplate, 160);
      if (!title) continue;
      const detail = text(stage.customerDetailTemplate, 500);
      const at = facts.get(stage.eventKind);
      const eventIndex = firstEventForKind.get(stage.eventKind);
      const event = eventIndex === undefined ? undefined : events[eventIndex];
      const locationLabel = event?.node?.customerVisible &&
        ["shipment_arrived", "returned_to_dispatch", "ready_for_pickup"].includes(event.eventKind)
        ? text(event.node.publicName, 160)
        : undefined;
      if (at) {
        if (eventIndex !== undefined) represented.add(eventIndex);
        actual.push({
          id: "stage-" + (index + 1), at: iso(at), title, ...(detail ? { detail } : {}),
          ...(locationLabel ? { locationLabel } : {}),
          status: "complete", kind: stage.eventKind.startsWith("order_") ? "order"
            : ["order_confirmed", "picking_started", "packed", "fulfilment_handed_over"].includes(stage.eventKind)
              ? "fulfilment"
              : ["delivered", "delivery_failed", "delivery_rescheduled", "out_for_delivery"].includes(stage.eventKind)
                ? "delivery" : "shipment",
          order: index,
        });
      } else if (stage.showPlannedWhenPending) {
        // Timestamp is a display sorting anchor, not an arrival prediction.
        planned.push({
          id: "planned-" + (index + 1), at: iso(updatedAt), title,
          ...(detail ? { detail } : {}), status: "planned",
          kind: "shipment",
        });
      }
    }

    events.forEach((event, index) => {
      if (represented.has(index)) return;
      // No customer-facing notes on arbitrary event kinds; title is either
      // a guarded custom title or a pinned safe canonical phrase.
      const title = customerEventCopy(event.eventKind, event.customerTitle, 160) ?? EVENT_TITLES[event.eventKind];
      if (!title) return;
      const detail = customerEventCopy(event.eventKind, event.customerDetail, 500);
      const locationLabel = event.node?.customerVisible &&
        ["shipment_arrived", "returned_to_dispatch", "ready_for_pickup"].includes(event.eventKind)
        ? text(event.node.publicName, 160) : undefined;
      actual.push({
        id: "event-" + (index + 1), at: iso(event.occurredAt),
        title, ...(detail ? { detail } : {}),
        ...(locationLabel ? { locationLabel } : {}),
        status: "complete",
        kind: ["delivered", "delivery_failed", "delivery_rescheduled", "rider_picked_up", "out_for_delivery",
          "returned_toward_store", "returned_to_dispatch"].includes(event.eventKind) ? "delivery" : "shipment",
        order: shipment.workflowVersion.stages.length + index,
      });
    });

    actual.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
    const milestones: CustomerTrackingMilestone[] = actual.map(({ order: _order, ...milestone }) => milestone);
    if (milestones.length && !["delivered", "collected"].includes(state)) {
      milestones[milestones.length - 1]!.status = "current";
    }
    const result = {
      source: "shipment" as const,
      state,
      headline: HEADLINES[state],
      ...(currentLocationLabel ? { currentLocationLabel } : {}),
      updatedAt: iso(updatedAt),
      milestones: [...milestones, ...planned].slice(-160),
    };
    return customerTrackingJourneySchema.parse(result);
  }
}
