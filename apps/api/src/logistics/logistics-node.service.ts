import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  logisticsNodeViewSchema,
  type LogisticsNodeView,
  type LogisticsNodeKind,
} from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { assertSafeCustomerLabel, boundedText, logisticsCommandHash, normalizeNodeCode, normalizeMatchText } from "./logistics.values";

type NodeCreateInput = {
  code: string; name: string; publicName: string; kind: LogisticsNodeKind;
  kindLabel?: string | null; parentNodeId?: string | null; inventoryLocationId?: string | null;
  addressLine?: string | null; locality?: string | null; region?: string | null; ghanaPostGps?: string | null;
  publicDirections?: string | null; publicContact?: string | null; customerVisible?: boolean; active?: boolean;
};
type NodeUpdateInput = Partial<NodeCreateInput>;
type NodeListQuery = { q?: string; kind?: LogisticsNodeKind; active?: boolean };
type Tx = Prisma.TransactionClient;

function conflict(message: string, details?: unknown): never {
  throw new ApiProblem(409, "CONFLICT", message, details);
}

@Injectable()
export class LogisticsNodeService {
  constructor(private readonly db: Database) {}

  private async advisory(tx: Tx, actorId: string, operation: string, key: string) {
    const lockKey = JSON.stringify([actorId, operation, key]);
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private normalizeCreate(input: NodeCreateInput) {
    return {
      code: normalizeNodeCode(input.code),
      name: boundedText(input.name, 160, "Node name")!,
      publicName: assertSafeCustomerLabel(input.publicName, "Public node name"),
      kind: input.kind,
      kindLabel: input.kindLabel == null ? null : boundedText(input.kindLabel, 80, "Node kind label"),
      parentNodeId: input.parentNodeId?.trim() || null,
      inventoryLocationId: input.inventoryLocationId?.trim() || null,
      addressLine: input.addressLine == null ? null : boundedText(input.addressLine, 240, "Address"),
      locality: input.locality == null ? null : boundedText(input.locality, 120, "Locality"),
      region: input.region == null ? null : boundedText(input.region, 120, "Region"),
      ghanaPostGps: input.ghanaPostGps == null ? null : boundedText(input.ghanaPostGps, 80, "GhanaPost GPS"),
      publicDirections: input.publicDirections == null ? null : boundedText(input.publicDirections, 500, "Public directions"),
      publicContact: input.publicContact == null ? null : boundedText(input.publicContact, 160, "Public contact"),
      customerVisible: input.customerVisible ?? true,
      active: input.active ?? true,
    };
  }

  private normalizeUpdate(input: NodeUpdateInput) {
    const out: Record<string, unknown> = {};
    if (input.code !== undefined) out.code = normalizeNodeCode(input.code);
    if (input.name !== undefined) out.name = boundedText(input.name, 160, "Node name")!;
    if (input.publicName !== undefined) out.publicName = assertSafeCustomerLabel(input.publicName, "Public node name");
    if (input.kind !== undefined) out.kind = input.kind;
    if (input.kindLabel !== undefined) out.kindLabel = input.kindLabel == null ? null : boundedText(input.kindLabel, 80, "Node kind label");
    if (input.parentNodeId !== undefined) out.parentNodeId = input.parentNodeId?.trim() || null;
    if (input.inventoryLocationId !== undefined) out.inventoryLocationId = input.inventoryLocationId?.trim() || null;
    if (input.addressLine !== undefined) out.addressLine = input.addressLine == null ? null : boundedText(input.addressLine, 240, "Address");
    if (input.locality !== undefined) out.locality = input.locality == null ? null : boundedText(input.locality, 120, "Locality");
    if (input.region !== undefined) out.region = input.region == null ? null : boundedText(input.region, 120, "Region");
    if (input.ghanaPostGps !== undefined) out.ghanaPostGps = input.ghanaPostGps == null ? null : boundedText(input.ghanaPostGps, 80, "GhanaPost GPS");
    if (input.publicDirections !== undefined) out.publicDirections = input.publicDirections == null ? null : boundedText(input.publicDirections, 500, "Public directions");
    if (input.publicContact !== undefined) out.publicContact = input.publicContact == null ? null : boundedText(input.publicContact, 160, "Public contact");
    if (input.customerVisible !== undefined) out.customerVisible = input.customerVisible;
    if (input.active !== undefined) out.active = input.active;
    if (!Object.keys(out).length) throw new ApiProblem(400, "VALIDATION_FAILED", "At least one node field is required.");
    return out;
  }

  private async validateReferences(tx: Tx, nodeId: string | null, data: Record<string, unknown>) {
    const parentNodeId = data.parentNodeId as string | null | undefined;
    if (parentNodeId) {
      if (nodeId && parentNodeId === nodeId) conflict("A logistics node cannot be its own parent.");
      const parent = await tx.logisticsNode.findUnique({ where: { id: parentNodeId }, select: { id: true } });
      if (!parent) throw new ApiProblem(422, "RULE_VIOLATION", "Parent logistics node does not exist.");
    }
    const inventoryLocationId = data.inventoryLocationId as string | null | undefined;
    if (inventoryLocationId) {
      const location = await tx.location.findUnique({ where: { id: inventoryLocationId }, select: { active: true } });
      if (!location || !location.active) throw new ApiProblem(422, "RULE_VIOLATION", "Inventory location must exist and be active before it can back a logistics node.");
    }
  }

  private async dependencyCounts(tx: Tx | Database, nodeId: string, inventoryLocationId: string | null) {
    const [activeIncomingLanes, activeOutgoingLanes, activeRouteRules, childNodes, location] = await Promise.all([
      tx.logisticsLane.count({ where: { destinationNodeId: nodeId, active: true } }),
      tx.logisticsLane.count({ where: { originNodeId: nodeId, active: true } }),
      tx.deliveryRouteRule.count({ where: { active: true, OR: [{ originNodeId: nodeId }, { finalPickupNodeId: nodeId }, { stops: { some: { nodeId } } }] } }),
      tx.logisticsNode.count({ where: { parentNodeId: nodeId } }),
      inventoryLocationId ? tx.location.findUnique({ where: { id: inventoryLocationId }, select: { active: true } }) : Promise.resolve(null),
    ]);
    return {
      activeIncomingLanes, activeOutgoingLanes, activeRouteRules, childNodes,
      inventoryLocationExists: inventoryLocationId ? !!location : false,
      inventoryLocationActive: inventoryLocationId ? !!location?.active : false,
    };
  }

  private async view(tx: Tx | Database, node: Awaited<ReturnType<Database["logisticsNode"]["findUniqueOrThrow"]>>): Promise<LogisticsNodeView> {
    const dependencies = await this.dependencyCounts(tx, node.id, node.inventoryLocationId);
    return logisticsNodeViewSchema.parse({ ...node, createdAt: node.createdAt.toISOString(), updatedAt: node.updatedAt.toISOString(), dependencies });
  }

  private parseReplay(outcome: Prisma.JsonValue): LogisticsNodeView {
    const parsed = logisticsNodeViewSchema.safeParse(outcome);
    if (!parsed.success) conflict("Logistics node replay state is incomplete.");
    return parsed.data;
  }

  async list(query: NodeListQuery): Promise<LogisticsNodeView[]> {
    const q = normalizeMatchText(query.q);
    const rows = await this.db.logisticsNode.findMany({
      where: {
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.active === undefined ? {} : { active: query.active }),
        ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { publicName: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
      take: 100,
    });
    return Promise.all(rows.map((row) => this.view(this.db, row)));
  }

  async get(nodeId: string): Promise<LogisticsNodeView> {
    const node = await this.db.logisticsNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new ApiProblem(404, "NOT_FOUND", "Logistics node not found.");
    return this.view(this.db, node);
  }

  async create(actorId: string, idempotencyKey: string, input: NodeCreateInput, requestId: string): Promise<LogisticsNodeView> {
    const normalized = this.normalizeCreate(input);
    const operation = "logistics.node.create";
    const requestHash = logisticsCommandHash(normalized);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different logistics node command.");
        return this.parseReplay(replay.outcome);
      }
      await this.validateReferences(tx, null, normalized);
      let node;
      try { node = await tx.logisticsNode.create({ data: normalized }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") conflict("Logistics node code or inventory location is already in use."); throw error; }
      const outcome = await this.view(tx, node);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.node.created", entityId: node.id, requestId, details: { code: node.code, kind: node.kind } } });
      await tx.outboxEvent.create({ data: { type: "logistics.node.created", aggregateId: node.id, payload: { nodeId: node.id, code: node.code, kind: node.kind } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async update(actorId: string, nodeId: string, idempotencyKey: string, input: NodeUpdateInput, requestId: string): Promise<LogisticsNodeView> {
    const normalized = this.normalizeUpdate(input);
    const operation = `logistics.node.update:${nodeId}`;
    const requestHash = logisticsCommandHash(normalized);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different logistics node command.");
        return this.parseReplay(replay.outcome);
      }
      await tx.$queryRaw`SELECT id FROM "LogisticsNode" WHERE id=${nodeId} FOR UPDATE`;
      const current = await tx.logisticsNode.findUnique({ where: { id: nodeId } });
      if (!current) throw new ApiProblem(404, "NOT_FOUND", "Logistics node not found.");
      const effective = { ...current, ...normalized } as Record<string, unknown>;
      await this.validateReferences(tx, nodeId, effective);
      if (normalized.active === false && current.active) {
        const deps = await this.dependencyCounts(tx, nodeId, (effective.inventoryLocationId as string | null) ?? null);
        if (deps.activeIncomingLanes || deps.activeOutgoingLanes || deps.activeRouteRules)
          conflict("Deactivate dependent active lanes and route rules before deactivating this logistics node.", deps);
      }
      let node;
      try { node = await tx.logisticsNode.update({ where: { id: nodeId }, data: normalized }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") conflict("Logistics node code or inventory location is already in use."); throw error; }
      const outcome = await this.view(tx, node);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.node.updated", entityId: node.id, requestId, details: { code: node.code, active: node.active } } });
      await tx.outboxEvent.create({ data: { type: "logistics.node.updated", aggregateId: node.id, payload: { nodeId: node.id, code: node.code, active: node.active } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }
}
