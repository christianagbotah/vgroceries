import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ReceiveRequest, InventoryOverviewRow } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { AuthRequest } from "../identity/identity.service";
import { tokenHash } from "../identity/crypto";
import { randomUUID } from "node:crypto";
import { classifyInventoryLot } from "./expiry-classification";

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
  /** Authoritative stock report. Filters, totals and pagination run in PostgreSQL. */
  async overview(
    req: AuthRequest,
    query: { q: string; filter: "all" | "low" | "zero" | "reserved";
      locationId?: string; page: number; perPage: number },
  ) {
    const locationId = query.locationId ?? this.config.stockLocationId;
    this.authorize(req, locationId);
    const location = await this.db.location.findUnique({ where: { id: locationId } });
    if (!location?.active) {
      throw new ApiProblem(404, "NOT_FOUND", "Active stock location not found.");
    }
    const { filter, page, perPage } = query;
    const search = query.q.trim().toLowerCase();
    const offset = (page - 1) * perPage;
    type StockRow = {
      variantId: string; productId: string; productName: string;
      variantName: string; unit: string; image: string;
      sellablePhysical: Prisma.Decimal; reserved: Prisma.Decimal;
      safetyStock: Prisma.Decimal; availableToSell: Prisma.Decimal;
      lotCount: bigint; nextExpiry: Date | null;
      lastMovement: string | null; lastMovementAt: Date | null;
    };
    type StockTotals = {
      sellablePhysical: Prisma.Decimal; reserved: Prisma.Decimal;
      safetyStock: Prisma.Decimal; availableToSell: Prisma.Decimal;
    };
    type UnsafeTotals = { quarantined: Prisma.Decimal; damagedExpired: Prisma.Decimal };
    // REPEATABLE READ prevents a receipt or sale from changing the summary
    // halfway through this report. This is reporting only, never stock authority.
    const [rows, count, summary, unsafe] = await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<StockRow[]>`
        SELECT a."variantId", v."productId", p.name AS "productName",
          v.name AS "variantName", v.unit, p.image,
          a."sellablePhysical", a.reserved, a."safetyStock", a."availableToSell",
          (SELECT COUNT(*) FROM "StockLot" l
             WHERE l."positionId"=a."positionId" AND l.quantity>0) AS "lotCount",
          (SELECT MIN(l."expiryDate") FROM "StockLot" l
             WHERE l."positionId"=a."positionId" AND l.quantity>0
               AND l.kind='regular' AND NOT l.quarantined
               AND l."expiryDate" > (now() AT TIME ZONE 'UTC')::date) AS "nextExpiry",
          movement.reason AS "lastMovement",
          movement."createdAt" AS "lastMovementAt"
        FROM variant_availability a
        JOIN "Variant" v ON v.id=a."variantId"
        JOIN "Product" p ON p.id=v."productId"
        LEFT JOIN LATERAL (
          SELECT m.reason,m."createdAt" FROM "StockMovement" m
          JOIN "StockLot" l ON l.id=m."lotId"
          WHERE l."positionId"=a."positionId"
          ORDER BY m."createdAt" DESC,m.id DESC LIMIT 1
        ) movement ON true
        WHERE a."locationId"=${locationId} AND v.active
          AND (${search}='' OR POSITION(${search} IN LOWER(p.name || ' ' || v.name))>0)
          AND (${filter}='all'
             OR (${filter}='low' AND a."availableToSell">0 AND a."availableToSell"<=3)
             OR (${filter}='zero' AND a."availableToSell"=0)
             OR (${filter}='reserved' AND a.reserved>0))
        ORDER BY p.name,v.name,v.id LIMIT ${perPage} OFFSET ${offset}`;
      const [count] = await tx.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM variant_availability a
        JOIN "Variant" v ON v.id=a."variantId"
        JOIN "Product" p ON p.id=v."productId"
        WHERE a."locationId"=${locationId} AND v.active
          AND (${search}='' OR POSITION(${search} IN LOWER(p.name || ' ' || v.name))>0)
          AND (${filter}='all'
             OR (${filter}='low' AND a."availableToSell">0 AND a."availableToSell"<=3)
             OR (${filter}='zero' AND a."availableToSell"=0)
             OR (${filter}='reserved' AND a.reserved>0))`;
      const [summary] = await tx.$queryRaw<StockTotals[]>`
        SELECT COALESCE(SUM(a."sellablePhysical"),0) AS "sellablePhysical",
          COALESCE(SUM(a.reserved),0) AS reserved,
          COALESCE(SUM(a."safetyStock"),0) AS "safetyStock",
          COALESCE(SUM(a."availableToSell"),0) AS "availableToSell"
        FROM variant_availability a JOIN "Variant" v ON v.id=a."variantId"
        WHERE a."locationId"=${locationId} AND v.active`;
      const [unsafe] = await tx.$queryRaw<UnsafeTotals[]>`
        SELECT
          COALESCE(SUM(CASE WHEN l.quantity>0
            AND l.kind NOT IN ('damaged','waste','disposed','unsafe','spoilage')
            AND (l.quarantined OR l.kind<>'regular') THEN l.quantity ELSE 0 END),0)
            AS quarantined,
          COALESCE(SUM(CASE WHEN l.quantity>0
            AND (l.kind IN ('damaged','waste','disposed','unsafe','spoilage')
              OR (l.kind='regular' AND NOT l.quarantined AND
                l."expiryDate" <= (now() AT TIME ZONE 'UTC')::date))
            THEN l.quantity ELSE 0 END),0) AS "damagedExpired"
        FROM "StockLot" l
        JOIN "StockPosition" sp ON sp.id=l."positionId"
        JOIN "Variant" v ON v.id=sp."variantId"
        WHERE sp."locationId"=${locationId} AND v.active`;
      return [rows, count, summary, unsafe] as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return {
      rows: rows.map((r): InventoryOverviewRow => ({
        variantId: r.variantId, productId: r.productId,
        productName: r.productName, variantName: r.variantName,
        unit: r.unit, image: r.image,
        sellablePhysical: r.sellablePhysical.toString(),
        reserved: r.reserved.toString(),
        safetyStock: r.safetyStock.toString(),
        availableToSell: r.availableToSell.toString(),
        isAvailable: r.availableToSell.gt(0),
        lotCount: Number(r.lotCount),
        ...(r.nextExpiry ? { nextExpiry: r.nextExpiry.toISOString() } : {}),
        ...(r.lastMovement ? { lastMovement: r.lastMovement } : {}),
        ...(r.lastMovementAt ? { lastMovementAt: r.lastMovementAt.toISOString() } : {}),
      })),
      total: Number(count.total), page, perPage, locationId,
      summary: {
        sellablePhysical: summary.sellablePhysical.toString(),
        reserved: summary.reserved.toString(),
        safetyStock: summary.safetyStock.toString(),
        availableToSell: summary.availableToSell.toString(),
        quarantined: unsafe.quarantined.toString(),
        damagedExpired: unsafe.damagedExpired.toString(),
      },
    };
  }
  /** Recorded goods receipts from a single authorised branch, not mock history. */
  async receipts(req: AuthRequest, locationId = this.config.stockLocationId) {
    this.authorize(req, locationId);
    const location = await this.db.location.findUnique({
      where: { id: locationId }, select: { active: true },
    });
    if (!location?.active) {
      throw new ApiProblem(404, "NOT_FOUND", "Active stock location not found.");
    }
    const receipts = await this.db.stockReceipt.findMany({
      where: { lots: { some: { position: { locationId } } } },
      include: { lots: {
        where: { position: { locationId } },
        include: {
          position: { include: { variant: { include: { product: true } } } },
          movements: { where: { reason: "receive" }, select: { delta: true }, take: 1 },
        },
      } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 501,
    });
    if (receipts.length > 500) {
      throw new ApiProblem(409, "REPORT_TOO_LARGE",
        "Receipt history exceeds 500 records for this branch. Use a narrower date range once available.");
    }
    const actorIds = [...new Set(receipts.map(r => r.receivedBy))];
    const staff = actorIds.length ? await this.db.user.findMany({
      where: { id: { in: actorIds } }, select: { id: true, name: true },
    }) : [];
    const names = new Map(staff.map(user => [user.id, user.name]));
    return receipts.map(receipt => {
      const at = receipt.createdAt.toISOString();
      return {
        id: receipt.id,
        receivedAtLabel: at.slice(8,10) + "-" + at.slice(5,7) + "-" + at.slice(0,4) + " " + at.slice(11,16),
        receivedBy: names.get(receipt.receivedBy) ?? "Unlinked historical actor",
        ...(receipt.poRef ? { poRef: receipt.poRef } : {}),
        ...(receipt.note ? { note: receipt.note } : {}),
        lines: receipt.lots.map(lot => ({
          productName: lot.position.variant.product.name,
          variantName: lot.position.variant.name,
          lotNumber: lot.lotNumber,
          // Historical receipt quantities come from the immutable initial
          // movement, NOT the lot's remaining balance after later sales.
          quantity: lot.movements[0]?.delta.toString() ?? "Unverified",
          ...(lot.expiryDate ? { expiryDate: lot.expiryDate.toISOString().slice(0, 10) } : {}),
        })),
      };
    });
  }

  /** A live lot ledger; returns only positive recorded balances, never mock lots. */
  async lots(req: AuthRequest, locationId = this.config.stockLocationId, variantId?: string) {
    this.authorize(req, locationId);
    const location = await this.db.location.findUnique({
      where: { id: locationId }, select: { id: true, name: true, active: true },
    });
    if (!location?.active) {
      throw new ApiProblem(404, "NOT_FOUND", "Active stock location not found.");
    }
    const lots = await this.db.stockLot.findMany({
      where: { quantity: { gt: 0 }, position: { locationId, ...(variantId ? { variantId } : {}) } },
      include: { position: { include: { variant: { include: { product: true } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1001,
    });
    if (lots.length > 1000) {
      throw new ApiProblem(409, "REPORT_TOO_LARGE",
        "The live lot ledger exceeds 1,000 rows; narrow the report by variant.");
    }
    const today = new Date().toISOString().slice(0, 10);
    return lots.map(lot => {
      const expiryDate = lot.expiryDate?.toISOString().slice(0, 10);
      return {
        id: lot.id,
        productName: lot.position.variant.product.name,
        variantName: lot.position.variant.name,
        lotNumber: lot.lotNumber,
        quantity: lot.quantity.toString(),
        kind: lot.kind,
        isQuarantined: lot.quarantined,
        expired: Boolean(expiryDate && expiryDate <= today),
        ...(expiryDate ? { expiryDate } : {}),
        location: location.name,
        variantId: lot.position.variantId,
      };
    });
  }

  /** Read-only lot exception reporting on the same authoritative inventory DB. */
  async expiry(req: AuthRequest, locationId = this.config.stockLocationId) {
    this.authorize(req, locationId);
    const location = await this.db.location.findUnique({
      where: { id: locationId }, select: { id: true, name: true, active: true },
    });
    if (!location?.active) {
      throw new ApiProblem(404, "NOT_FOUND", "Active stock location not found.");
    }
    const lots = await this.db.stockLot.findMany({
      where: { quantity: { gt: 0 }, position: { locationId } },
      include: { position: { include: { variant: { include: { product: true } } } } },
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      take: 2001,
    });
    if (lots.length > 2000) {
      throw new ApiProblem(409, "REPORT_TOO_LARGE",
        "Too many active lots for this report. Filter or archive old stock before retrying.");
    }
    const queues: {
      expired: Record<string, unknown>[];
      soon: Record<string, unknown>[];
      quarantined: Record<string, unknown>[];
      damaged: Record<string, unknown>[];
    } = { expired: [], soon: [], quarantined: [], damaged: [] };
    const today = new Date().toISOString().slice(0, 10);
    for (const lot of lots) {
      const expiryDate = lot.expiryDate?.toISOString().slice(0, 10) ?? null;
      const classification = classifyInventoryLot({
        kind: lot.kind, quarantined: lot.quarantined, expiryDate,
      }, today);
      if (!classification) continue;
      const row = {
        id: lot.id,
        productName: lot.position.variant.product.name,
        variantName: lot.position.variant.name,
        variantId: lot.position.variantId,
        lotNumber: lot.lotNumber,
        quantity: lot.quantity.toString(),
        ...(expiryDate ? { expiryDate } : {}),
        kind: lot.kind,
        isQuarantined: lot.quarantined,
        location: location.name,
        ...(classification.daysLeft !== undefined
          ? { daysLeft: classification.daysLeft } : {}),
      };
      queues[classification.queue].push(row);
    }
    return queues;
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
