import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ReceiveRequest, InventoryOverviewRow } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { AuthRequest } from "../identity/identity.service";
import { tokenHash } from "../identity/crypto";
import { randomUUID } from "node:crypto";

@Injectable()
export class InventoryService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  private authorize(req: AuthRequest, locationId: string) {
    if (
      req.actor.role !== "admin" &&
      !req.actor.locationIds.includes(locationId)
    )
      throw new ApiProblem(403, "FORBIDDEN", "Location access denied.");
  }
  async overview(
    req: AuthRequest,
    locationId = this.config.stockLocationId,
    page = 1,
    perPage = 48,
  ) {
    this.authorize(req, locationId);
    const location = await this.db.location.findUnique({
      where: { id: locationId },
    });
    if (!location?.active)
      throw new ApiProblem(
        404,
        "NOT_FOUND",
        "Active stock location not found.",
      );
    type Row = {
      variantId: string;
      productId: string;
      productName: string;
      variantName: string;
      unit: string;
      image: string;
      sellablePhysical: Prisma.Decimal;
      reserved: Prisma.Decimal;
      safetyStock: Prisma.Decimal;
      availableToSell: Prisma.Decimal;
      lotCount: bigint;
    };
    const rows = await this.db.$queryRaw<
      Row[]
    >`SELECT a.*,v."productId",p.name AS "productName",v.name AS "variantName",v.unit,p.image,
      (SELECT count(*) FROM "StockLot" l WHERE l."positionId"=a."positionId") AS "lotCount"
      FROM variant_availability a JOIN "Variant" v ON v.id=a."variantId" JOIN "Product" p ON p.id=v."productId"
      WHERE a."locationId"=${locationId} AND v.active ORDER BY p.name,v.id LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
    const [count] = await this.db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM "StockPosition" s JOIN "Variant" v ON v.id=s."variantId" WHERE s."locationId"=${locationId} AND v.active`;
    return {
      rows: rows.map(
        (r): InventoryOverviewRow => ({
          variantId: r.variantId,
          productId: r.productId,
          productName: r.productName,
          variantName: r.variantName,
          unit: r.unit,
          image: r.image,
          sellablePhysical: r.sellablePhysical.toString(),
          reserved: r.reserved.toString(),
          safetyStock: r.safetyStock.toString(),
          availableToSell: r.availableToSell.toString(),
          isAvailable: r.availableToSell.gt(0),
          lotCount: Number(r.lotCount),
        }),
      ),
      total: Number(count.total),
      page,
      perPage,
      locationId,
    };
  }
  async receive(req: AuthRequest, input: ReceiveRequest, key: string) {
    if (input.supplierId)
      throw new ApiProblem(
        422,
        "RULE_VIOLATION",
        "Supplier receiving awaits the purchasing module.",
      );
    const lines = input.lines.map((l) => ({
      ...l,
      quantity: new Prisma.Decimal(l.quantity).toString(),
      location: l.location ?? this.config.stockLocationId,
    }));
    for (const line of lines) this.authorize(req, line.location);
    const requestHash = tokenHash(
      JSON.stringify({ lines, note: input.note, poRef: input.poRef }),
    );
    const scope = JSON.stringify([req.actor.id, "inventory.receive", key]);
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},0))`;
        const where = {
          actorId_operation_key: {
            actorId: req.actor.id,
            operation: "inventory.receive",
            key,
          },
        };
        const existing = await tx.idempotency.findUnique({ where });
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new ApiProblem(
              409,
              "IDEMPOTENCY_CONFLICT",
              "This key was already used for different receipt data.",
            );
          return existing.outcome as unknown as { receiptId: string };
        }
        for (const line of lines) {
          const variant = await tx.variant.findUnique({
            where: { id: line.variantId },
          });
          if (!variant)
            throw new ApiProblem(404, "NOT_FOUND", "Variant not found.");
          if (!variant.active)
            throw new ApiProblem(
              409,
              "CONFLICT",
              "Cannot receive an inactive variant.",
            );
          if (
            !["kg", "litre"].includes(variant.unit) &&
            !new Prisma.Decimal(line.quantity).isInteger()
          )
            throw new ApiProblem(
              400,
              "VALIDATION_FAILED",
              "This variant requires whole base units.",
            );
          const location = await tx.location.findUnique({
            where: { id: line.location },
          });
          if (!location)
            throw new ApiProblem(404, "NOT_FOUND", "Location not found.");
          if (!location.active)
            throw new ApiProblem(
              409,
              "CONFLICT",
              "Cannot receive at an inactive location.",
            );
        }
        const sorted = [
          ...new Map(
            lines.map((l) => [JSON.stringify([l.variantId, l.location]), l]),
          ).values(),
        ].sort(
          (a, b) =>
            a.variantId.localeCompare(b.variantId) ||
            a.location.localeCompare(b.location),
        );
        const positions = new Map<string, string>();
        for (const line of sorted) {
          // A Prisma empty-update upsert races before the row exists. Let the
          // unique index arbitrate creation, then lock the durable position.
          await tx.$executeRaw`INSERT INTO "StockPosition" (id,"variantId","locationId")
            VALUES (${randomUUID()},${line.variantId},${line.location})
            ON CONFLICT ("variantId","locationId") DO NOTHING`;
          const [p] = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "StockPosition"
            WHERE "variantId"=${line.variantId} AND "locationId"=${line.location} FOR UPDATE`;
          positions.set(JSON.stringify([line.variantId, line.location]), p.id);
        }
        const receipt = await tx.stockReceipt.create({
          data: {
            receivedBy: req.actor.id,
            note: input.note,
            poRef: input.poRef,
          },
        });
        for (const [i, line] of lines.entries()) {
          const positionId = positions.get(
            JSON.stringify([line.variantId, line.location]),
          )!;
          const expiryDate = line.expiryDate ? new Date(line.expiryDate) : null;
          const lot = await tx.stockLot.create({
            data: {
              positionId,
              receiptId: receipt.id,
              quantity: line.quantity,
              lotNumber: line.lotNumber ?? `${receipt.id}-${i + 1}`,
              expiryDate,
              quarantined:
                !!expiryDate &&
                line.expiryDate! <= new Date().toISOString().slice(0, 10),
              unitCostMinor: line.unitCostMinor,
            },
          });
          await tx.stockMovement.create({
            data: {
              lotId: lot.id,
              receiptId: receipt.id,
              delta: line.quantity,
              resultingQty: line.quantity,
              actorId: req.actor.id,
              reason: "receive",
            },
          });
        }
        const outcome = { receiptId: receipt.id };
        await tx.idempotency.create({
          data: {
            actorId: req.actor.id,
            operation: "inventory.receive",
            key,
            requestHash,
            outcome,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: req.actor.id,
            action: "inventory.received",
            entityId: receipt.id,
            requestId: req.requestId,
            details: {
              lineCount: lines.length,
              locationIds: [...new Set(lines.map((l) => l.location))],
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: "inventory.received",
            aggregateId: receipt.id,
            payload: {
              receiptId: receipt.id,
              variantIds: [...new Set(lines.map((l) => l.variantId))],
            },
          },
        });
        return outcome;
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
}
