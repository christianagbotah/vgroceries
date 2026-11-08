import { Injectable } from "@nestjs/common";
import type { CustomerRefundView, PublicOrder, RefundSourceType } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { ShipmentCustomerTrackingService } from "../logistics/shipment-customer-tracking.service";
import { legacyOrderTrackingJourney } from "./legacy-order-tracking";

const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;
const refundSourceLabel = (source: RefundSourceType) => {
  switch (source) {
    case "customer_cancellation": return "Customer cancellation";
    case "payment_review_cancellation": return "Payment review cancellation";
    case "overcharge_correction": return "Payment correction";
    case "return": return "Return refund";
  }
};

@Injectable()
export class OrderProjectionService {
  constructor(private readonly db: Database, private readonly tracking: ShipmentCustomerTrackingService) {}

  async publicOrder(orderId: string): Promise<PublicOrder> {
    const o = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        lines: { orderBy: { id: "asc" } },
        events: { where: { customerSafe: true }, orderBy: { createdAt: "asc" } },
        slot: true,
        pickupSnapshot: true,
        pickupAppointment: true,
        paymentAttempts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        refunds: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
    if (!o) throw new ApiProblem(404, "NOT_FOUND", "Order not found.");

    // Cancellation is authoritative before handover; its planned Shipment is
    // retained for history and must not advertise an active future journey.
    const trackingJourney = o.fulfilmentStatus === "cancelled"
      ? legacyOrderTrackingJourney(o)
      : (await this.tracking.project(orderId)) ?? legacyOrderTrackingJourney(o);

    const refunds: CustomerRefundView[] = o.refunds.map((refund) => ({
      id: refund.id,
      amountMinor: refund.amountMinor,
      amountLabel: money(refund.amountMinor),
      status: refund.status as CustomerRefundView["status"],
      sourceLabel: refundSourceLabel(refund.sourceType as RefundSourceType),
      createdAt: refund.createdAt.toISOString(),
      ...(refund.approvedAt ? { approvedAt: refund.approvedAt.toISOString() } : {}),
      ...(refund.resolvedAt ? { resolvedAt: refund.resolvedAt.toISOString() } : {}),
      ...(refund.failureReason ? { failureReason: refund.failureReason } : {}),
    }));

    return {
      id: o.id,
      reference: o.reference,
      channel: o.channel as "online" | "pos",
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      fulfilment: o.fulfilment as PublicOrder["fulfilment"],
      ...(o.pickupSnapshot?.transportWindowStart && o.pickupSnapshot.transportWindowEnd ? {
        slotLabel: `${o.pickupSnapshot.transportWindowStart.toISOString().slice(0, 10)} ${o.pickupSnapshot.transportWindowStart.toISOString().slice(11, 16)}–${o.pickupSnapshot.transportWindowEnd.toISOString().slice(11, 16)}`,
      } : o.slot && !o.pickupSnapshot ? {
        slotLabel: `${o.slot.startsAt.toISOString().slice(0, 10)} ${o.slot.startsAt.toISOString().slice(11, 16)}–${o.slot.endsAt.toISOString().slice(11, 16)}`,
      } : {}),
      createdAt: o.createdAt.toISOString(),
      createdAtLabel: o.createdAt.toISOString(),
      subtotalMinor: o.subtotalMinor,
      discountMinor: o.discountMinor,
      deliveryFeeMinor: o.deliveryFeeMinor,
      totalMinor: o.totalMinor,
      totalLabel: money(o.totalMinor),
      paymentMethod: o.paymentMethod as PublicOrder["paymentMethod"],
      paymentStatus: o.paymentStatus as PublicOrder["paymentStatus"],
      fulfilmentStatus: o.fulfilmentStatus as PublicOrder["fulfilmentStatus"],
      deliveryStatus: o.deliveryStatus as PublicOrder["deliveryStatus"],
      paymentAttempts: o.paymentAttempts.map((attempt) => ({
        id: attempt.id,
        method: attempt.method,
        status: attempt.status,
        amountMinor: attempt.amountMinor,
        amountLabel: money(attempt.amountMinor),
        callbackCount: attempt.callbackCount,
        settlementState: attempt.settlementState,
        ...(attempt.failureReason ? { failureReason: attempt.failureReason } : {}),
        createdAt: attempt.createdAt.toISOString(),
      })),
      refunds,
      lines: o.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        variantId: line.variantId,
        productName: line.productName,
        variantName: line.variantName,
        unit: line.unit,
        quantity: line.quantity.toString(),
        unitPriceMinor: line.unitPriceMinor,
        unitPriceLabel: money(line.unitPriceMinor),
        lineTotalMinor: line.lineTotalMinor,
        lineTotalLabel: money(line.lineTotalMinor),
        allocations: [],
      })),
      notes: [],
      events: o.events.map((event) => ({
        at: event.createdAt.toISOString(),
        atLabel: event.createdAt.toISOString(),
        actor: event.actorKind,
        action: event.action,
        ...(event.fromStatus ? { fromStatus: event.fromStatus } : {}),
        ...(event.toStatus ? { toStatus: event.toStatus } : {}),
        ...(event.note ? { note: event.note } : {}),
      })),
      trackingJourney,
      ...(o.pickupAppointment?{pickupAppointment:{
        startsAt:o.pickupAppointment.startsAt.toISOString(),
        endsAt:o.pickupAppointment.endsAt.toISOString(),
        status:o.pickupAppointment.status as "booked"|"cancelled"|"completed",
        updatedAt:o.pickupAppointment.updatedAt.toISOString(),
      }}:{}),
      ...(o.pickupSnapshot ? {pickupPoint:{
        name:o.pickupSnapshot.name,
        ...(o.pickupSnapshot.locality?{locality:o.pickupSnapshot.locality}:{}),
        ...(o.pickupSnapshot.region?{region:o.pickupSnapshot.region}:{}),
        ...(o.pickupSnapshot.addressLine?{addressLine:o.pickupSnapshot.addressLine}:{}),
        ...(o.pickupSnapshot.ghanaPostGps?{ghanaPostGps:o.pickupSnapshot.ghanaPostGps}:{}),
        ...(o.pickupSnapshot.directions?{directions:o.pickupSnapshot.directions}:{}),
        ...(o.pickupSnapshot.contact?{contact:o.pickupSnapshot.contact}:{}),
        feeMinor:o.pickupSnapshot.feeMinor,
        feeBasis:o.pickupSnapshot.feeBasis as "zone_delivery"|"centre_pickup",
        ...(o.pickupSnapshot.transportWindowStart&&o.pickupSnapshot.transportWindowEnd?{
          transportWindow:{startsAt:o.pickupSnapshot.transportWindowStart.toISOString(),
            endsAt:o.pickupSnapshot.transportWindowEnd.toISOString()},
        }:{}),
      }}:{}),
      returns: [],
      ...(o.stockConsumedAt ? { stockConsumedAt: o.stockConsumedAt.toISOString() } : {}),
    };
  }
}
