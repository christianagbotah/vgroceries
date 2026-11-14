import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { tokenHash } from "../identity/crypto";
import type { AuthRequest } from "../identity/identity.service";
import { ApiProblem } from "../http/errors";

const decimalString = z.string().regex(/^[+-]?(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/);
export const requestAdjustmentSchema = z.strictObject({
  lotId: z.string().min(1).max(128),
  variantId: z.string().min(1).max(128),
  delta: decimalString,
  reason: z.string().trim().min(8).max(200),
  note: z.string().trim().max(1000).optional(),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});
export const decideAdjustmentSchema = z.strictObject({
  adjustmentId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
});
export type RequestAdjustment = z.infer<typeof requestAdjustmentSchema>;
export type DecideAdjustment = z.infer<typeof decideAdjustmentSchema>;

const today = () => new Date().toISOString().slice(0, 10);
const limit = new Prisma.Decimal("999999999999.999");
function reject(message: string): never {
  throw new ApiProblem(409, "ADJUSTMENT_CONFLICT", message);
}

/** Explicit maker/checker adjustments with durable before/after audit and reservation safety. */
@Injectable()
export class InventoryAdjustmentService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private authorize(req: AuthRequest, locationId: string) {
    if (req.actor.role !== "admin" && req.actor.role !== "inventory_manager")
      throw new ApiProblem(403, "FORBIDDEN", "Stock adjustment access requires a stock officer or administrator.");
    if (req.actor.role !== "admin" && !req.actor.locationIds.includes(locationId))
      throw new ApiProblem(403, "FORBIDDEN", "Location access denied.");
  }

  async list(req: AuthRequest, locationId = this.config.stockLocationId) {
    this.authorize(req, locationId);
    const location = await this.db.location.findUnique({ where: { id: locationId } });
    if (!location?.active)
      throw new ApiProblem(404, "NOT_FOUND", "Active stock location not found.");
    const rows = await this.db.stockAdjustment.findMany({
      where: { locationId },
      include: { lot: { include: { position: { include: { variant: { include: { product: true } } } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 501,
    });
    if (rows.length > 500)
      throw new ApiProblem(409, "REPORT_TOO_LARGE", "Adjustment history exceeds 500 rows at this location.");
    const actorIds = [...new Set(rows.flatMap(row => [row.requestedBy, ...(row.decidedBy ? [row.decidedBy] : [])]))];
    const users = actorIds.length ? await this.db.user.findMany({
      where: { id: { in: actorIds } }, select: { id: true, name: true },
    }) : [];
    const nameById = new Map(users.map(user => [user.id, user.name]));
    return rows.map(row => {
      const at = row.createdAt.toISOString();
      return {
        id: row.id,
        productName: row.lot.position.variant.product.name,
        variantName: row.lot.position.variant.name,
        lotNumber: row.lot.lotNumber,
        delta: row.delta.toString(),
        reason: row.reason,
        ...(row.note ? { note: row.note } : {}),
        status: row.status,
        requestedBy: nameById.get(row.requestedBy) ?? "Historical actor",
        requestedById: row.requestedBy,
        ...(row.decidedBy ? { approvedBy: nameById.get(row.decidedBy) ?? "Historical approver" } : {}),
        atLabel: at.slice(8, 10) + "-" + at.slice(5, 7) + "-" + at.slice(0, 4) + " " + at.slice(11, 16),
        beforeQuantity: row.beforeQuantity.toString(),
        ...(row.afterQuantity ? { afterQuantity: row.afterQuantity.toString() } : {}),
      };
    });
  }

  async request(req: AuthRequest, input: RequestAdjustment, key: string) {
    const locationId = input.locationId ?? this.config.stockLocationId;
    this.authorize(req, locationId);
    const delta = new Prisma.Decimal(input.delta);
    if (delta.isZero() || delta.abs().gt(limit))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Adjustment must be a non-zero, bounded quantity.");
    const clean = { locationId, lotId: input.lotId, variantId: input.variantId,
      delta: delta.toString(), reason: input.reason, note: input.note ?? "" };
    const hash = tokenHash(JSON.stringify(clean));
    const scope = JSON.stringify([req.actor.id, "inventory.adjustment.request", key]);
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},0))`;
      const idWhere = { actorId_operation_key: {
        actorId: req.actor.id, operation: "inventory.adjustment.request", key,
      } };
      const previous = await tx.idempotency.findUnique({ where: idWhere });
      if (previous) {
        if (previous.requestHash !== hash)
          reject("This request key was already used with different adjustment data.");
        return previous.outcome as { adjustmentId: string; status: string };
      }
      const location = await tx.location.findUnique({ where: { id: locationId } });
      if (!location?.active)
        throw new ApiProblem(404, "NOT_FOUND", "Active stock location not found.");
      const lot = await tx.stockLot.findUnique({
        where: { id: input.lotId },
        include: { position: { include: { variant: true } } },
      });
      if (!lot || lot.position.locationId !== locationId ||
        lot.position.variantId !== input.variantId)
        throw new ApiProblem(404, "NOT_FOUND", "Stock lot not found at this location.");
      const expiry = lot.expiryDate?.toISOString().slice(0, 10);
      if (!lot.position.variant.active || lot.kind !== "regular" ||
        lot.quarantined || (expiry && expiry <= today()))
        reject("Only active, sellable, unexpired stock can be quantity-corrected. Use the governed quarantine workflow for unsafe lots.");
      if (!["kg", "litre"].includes(lot.position.variant.unit) && !delta.isInteger())
        throw new ApiProblem(400, "VALIDATION_FAILED", "This product requires a whole-unit adjustment.");
      const next = lot.quantity.plus(delta);
      if (next.lt(0) || next.gt(limit))
        reject("The proposed correction would produce an invalid physical balance.");
      const adjustment = await tx.stockAdjustment.create({ data: {
        id: randomUUID(), lotId: input.lotId, variantId: input.variantId,
        locationId, delta, reason: input.reason, note: input.note || null,
        requestedBy: req.actor.id, beforeQuantity: lot.quantity,
      } });
      const outcome = { adjustmentId: adjustment.id, status: adjustment.status };
      await tx.idempotency.create({ data: {
        actorId: req.actor.id, operation: "inventory.adjustment.request", key,
        requestHash: hash, outcome,
      } });
      await tx.auditEvent.create({ data: {
        actorId: req.actor.id, action: "inventory.adjustment_requested",
        entityId: adjustment.id, requestId: req.requestId,
        details: { lotId: input.lotId, variantId: input.variantId,
          locationId, delta: delta.toString(), beforeQuantity: lot.quantity.toString(), reason: input.reason },
      } });
      return outcome;
    });
  }

  async decide(req: AuthRequest, input: DecideAdjustment) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Only an administrator may decide stock corrections.");
    return this.db.$transaction(async tx => {
      // Lock the request first: two reviewers never apply a correction twice.
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "StockAdjustment" WHERE id=${input.adjustmentId} FOR UPDATE`;
      if (!ids.length)
        throw new ApiProblem(404, "NOT_FOUND", "Adjustment request not found.");
      const adjustment = await tx.stockAdjustment.findUniqueOrThrow({
        where: { id: input.adjustmentId },
      });
      this.authorize(req, adjustment.locationId);
      if (adjustment.requestedBy === req.actor.id)
        throw new ApiProblem(403, "MAKER_CHECKER_REQUIRED", "A requester cannot approve or reject their own adjustment.");
      if (adjustment.status !== "pending_approval") {
        const requestedStatus = input.decision === "approve" ? "approved" : "rejected";
        if (adjustment.status !== requestedStatus) reject("This correction already has a different final decision.");
        return { adjustmentId: adjustment.id, status: adjustment.status, replayed: true };
      }
      if (input.decision === "reject") {
        await tx.stockAdjustment.update({ where: { id: adjustment.id }, data: {
          status: "rejected", decidedBy: req.actor.id, decidedAt: new Date(),
        } });
        await tx.auditEvent.create({ data: {
          actorId: req.actor.id, action: "inventory.adjustment_rejected",
          entityId: adjustment.id, requestId: req.requestId,
          details: { lotId: adjustment.lotId, delta: adjustment.delta.toString(),
            requestedBy: adjustment.requestedBy, reason: adjustment.reason },
        } });
        return { adjustmentId: adjustment.id, status: "rejected", replayed: false };
      }
      const location = await tx.location.findUnique({ where: { id: adjustment.locationId } });
      if (!location?.active) reject("This location is no longer available.");
      // Same lock order as the reservation allocator: position, then lot.
      const positions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "StockPosition"
        WHERE "locationId"=${adjustment.locationId} AND "variantId"=${adjustment.variantId}
        FOR UPDATE`;
      if (!positions.length) reject("The original stock position is missing.");
      const lots = await tx.$queryRaw<Array<{
        id: string; positionId: string; quantity: Prisma.Decimal; kind: string;
        quarantined: boolean; expiryDate: Date | null;
      }>>`SELECT id,"positionId",quantity,kind,quarantined,"expiryDate"
         FROM "StockLot" WHERE id=${adjustment.lotId} FOR UPDATE`;
      const lot = lots[0];
      if (!lot || lot.positionId !== positions[0].id)
        reject("The original stock lot no longer belongs to this location.");
      if (lot.kind !== "regular" || lot.quarantined ||
        (lot.expiryDate && lot.expiryDate.toISOString().slice(0, 10) <= today()))
        reject("This lot became unsafe; the quantity correction cannot be approved.");
      if (!lot.quantity.eq(adjustment.beforeQuantity))
        reject("Physical quantity changed after the request. Reject it and submit a correction based on current stock.");
      const newQuantity = lot.quantity.plus(adjustment.delta);
      if (newQuantity.lt(0) || newQuantity.gt(limit))
        reject("Physical stock would be negative or exceed the supported quantity.");
      const [held] = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
        SELECT COALESCE(SUM(quantity),0) AS quantity FROM "Reservation"
        WHERE "lotId"=${adjustment.lotId} AND state='active' AND "expiresAt">now()`;
      if (newQuantity.lt(held.quantity))
        reject("This correction would consume physical stock already reserved for active orders or held carts.");
      const receipt = await tx.stockReceipt.create({ data: {
        receivedBy: req.actor.id, poRef: `ADJ:${adjustment.id}`,
        note: `Approved inventory correction: ${adjustment.reason}`,
      } });
      await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: newQuantity } });
      await tx.stockMovement.create({ data: {
        lotId: lot.id, receiptId: receipt.id, delta: adjustment.delta,
        resultingQty: newQuantity, actorId: req.actor.id, reason: "adjustment",
      } });
      await tx.stockAdjustment.update({ where: { id: adjustment.id }, data: {
        status: "approved", decidedBy: req.actor.id, decidedAt: new Date(),
        afterQuantity: newQuantity, movementReceiptId: receipt.id,
      } });
      await tx.auditEvent.create({ data: {
        actorId: req.actor.id, action: "inventory.adjustment_approved",
        entityId: adjustment.id, requestId: req.requestId,
        details: { lotId: lot.id, variantId: adjustment.variantId,
          locationId: adjustment.locationId, delta: adjustment.delta.toString(),
          beforeQuantity: lot.quantity.toString(), afterQuantity: newQuantity.toString(),
          requestedBy: adjustment.requestedBy, reason: adjustment.reason },
      } });
      await tx.outboxEvent.create({ data: {
        type: "inventory.adjusted", aggregateId: adjustment.id,
        payload: { adjustmentId: adjustment.id, locationId: adjustment.locationId,
          variantId: adjustment.variantId, lotId: lot.id,
          delta: adjustment.delta.toString(), beforeQuantity: lot.quantity.toString(),
          afterQuantity: newQuantity.toString() },
      } });
      return { adjustmentId: adjustment.id, status: "approved", replayed: false };
    });
  }
}
