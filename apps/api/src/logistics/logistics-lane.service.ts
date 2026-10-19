import { Injectable } from "@nestjs/common";
import { Prisma, type LogisticsLane } from "@prisma/client";
import {
  logisticsLaneViewSchema,
  type LogisticsLaneMode,
  type LogisticsLaneView,
} from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { logisticsCommandHash, normalizeMatchText } from "./logistics.values";

type LaneCreateInput = {
  originNodeId: string;
  destinationNodeId: string;
  mode: LogisticsLaneMode;
  providerKey?: string | null;
  typicalMinutes: number;
  serviceDays?: number[];
  cutoffLocalTime?: string | null;
  priority?: number;
  active?: boolean;
};
type LaneUpdateInput = Partial<LaneCreateInput>;
type LaneListQuery = {
  q?: string;
  mode?: LogisticsLaneMode;
  originNodeId?: string;
  destinationNodeId?: string;
  active?: boolean;
};
type Tx = Prisma.TransactionClient;
type LaneRecord = LogisticsLane;

function conflict(message: string, details?: unknown): never {
  throw new ApiProblem(409, "CONFLICT", message, details);
}

@Injectable()
export class LogisticsLaneService {
  constructor(private readonly db: Database) {}

  private async advisory(tx: Tx, actorId: string, operation: string, key: string) {
    const lockKey = JSON.stringify([actorId, operation, key]);
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private validateNumbers(input: LaneCreateInput | LaneUpdateInput) {
    if (input.typicalMinutes !== undefined && (!Number.isInteger(input.typicalMinutes) || input.typicalMinutes < 1 || input.typicalMinutes > 10080))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Typical minutes must be an integer from 1 to 10080.");
    if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Lane priority must be a nonnegative integer.");
    if (input.serviceDays !== undefined) {
      if (!Array.isArray(input.serviceDays) || input.serviceDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7) || new Set(input.serviceDays).size !== input.serviceDays.length)
        throw new ApiProblem(400, "VALIDATION_FAILED", "Service days must be unique integers from 1 to 7.");
    }
    if (input.cutoffLocalTime !== undefined && input.cutoffLocalTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.cutoffLocalTime.trim()))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Lane cutoff time must use HH:mm.");
  }

  private normalizeCreate(input: LaneCreateInput) {
    this.validateNumbers(input);
    const originNodeId = input.originNodeId?.trim();
    const destinationNodeId = input.destinationNodeId?.trim();
    if (!originNodeId || !destinationNodeId) throw new ApiProblem(400, "VALIDATION_FAILED", "Lane origin and destination are required.");
    if (originNodeId === destinationNodeId) throw new ApiProblem(422, "RULE_VIOLATION", "Lane origin and destination must differ.");
    return {
      originNodeId,
      destinationNodeId,
      mode: input.mode,
      providerKey: input.providerKey == null ? null : normalizeMatchText(input.providerKey),
      typicalMinutes: input.typicalMinutes,
      serviceDays: [...(input.serviceDays ?? [])].sort((a, b) => a - b),
      cutoffLocalTime: input.cutoffLocalTime == null ? null : input.cutoffLocalTime.trim(),
      priority: input.priority ?? 0,
      active: input.active ?? true,
    };
  }

  private normalizeUpdate(input: LaneUpdateInput) {
    if (!Object.keys(input).length) throw new ApiProblem(400, "VALIDATION_FAILED", "At least one lane field is required.");
    this.validateNumbers(input);
    const out: Record<string, unknown> = {};
    if (input.originNodeId !== undefined) out.originNodeId = input.originNodeId.trim();
    if (input.destinationNodeId !== undefined) out.destinationNodeId = input.destinationNodeId.trim();
    if (input.mode !== undefined) out.mode = input.mode;
    if (input.providerKey !== undefined) out.providerKey = input.providerKey == null ? null : normalizeMatchText(input.providerKey);
    if (input.typicalMinutes !== undefined) out.typicalMinutes = input.typicalMinutes;
    if (input.serviceDays !== undefined) out.serviceDays = [...input.serviceDays].sort((a, b) => a - b);
    if (input.cutoffLocalTime !== undefined) out.cutoffLocalTime = input.cutoffLocalTime == null ? null : input.cutoffLocalTime.trim();
    if (input.priority !== undefined) out.priority = input.priority;
    if (input.active !== undefined) out.active = input.active;
    return out;
  }

  private async validateNodes(tx: Tx, effective: { originNodeId: string; destinationNodeId: string; active: boolean }) {
    if (!effective.originNodeId || !effective.destinationNodeId) throw new ApiProblem(400, "VALIDATION_FAILED", "Lane origin and destination are required.");
    if (effective.originNodeId === effective.destinationNodeId) throw new ApiProblem(422, "RULE_VIOLATION", "Lane origin and destination must differ.");
    const rows = await tx.logisticsNode.findMany({
      where: { id: { in: [effective.originNodeId, effective.destinationNodeId] } },
      select: { id: true, active: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const origin = byId.get(effective.originNodeId);
    const destination = byId.get(effective.destinationNodeId);
    if (!origin || !destination) throw new ApiProblem(422, "RULE_VIOLATION", "Lane origin and destination nodes must exist.");
    if (effective.active && (!origin.active || !destination.active)) throw new ApiProblem(422, "RULE_VIOLATION", "Active lanes require active origin and destination nodes.");
  }

  private async activeRouteRuleCount(tx: Tx | Database, laneId: string) {
    return tx.deliveryRouteRuleLeg.count({ where: { laneId, rule: { active: true } } });
  }

  private async view(tx: Tx | Database, lane: LaneRecord): Promise<LogisticsLaneView> {
    const [origin, destination, activeRouteRuleCount] = await Promise.all([
      tx.logisticsNode.findUnique({ where: { id: lane.originNodeId }, select: { id: true, code: true, publicName: true } }),
      tx.logisticsNode.findUnique({ where: { id: lane.destinationNodeId }, select: { id: true, code: true, publicName: true } }),
      this.activeRouteRuleCount(tx, lane.id),
    ]);
    if (!origin || !destination) conflict("Logistics lane node identity is incomplete.");
    return logisticsLaneViewSchema.parse({
      ...lane,
      providerKey: lane.providerKey,
      cutoffLocalTime: lane.cutoffLocalTime,
      origin,
      destination,
      activeRouteRuleCount,
      createdAt: lane.createdAt.toISOString(),
      updatedAt: lane.updatedAt.toISOString(),
    });
  }

  private parseReplay(outcome: Prisma.JsonValue): LogisticsLaneView {
    const parsed = logisticsLaneViewSchema.safeParse(outcome);
    if (!parsed.success) conflict("Logistics lane replay state is incomplete.");
    return parsed.data;
  }

  async list(query: LaneListQuery): Promise<LogisticsLaneView[]> {
    const q = normalizeMatchText(query.q);
    const rows = await this.db.logisticsLane.findMany({
      where: {
        ...(query.mode ? { mode: query.mode } : {}),
        ...(query.originNodeId ? { originNodeId: query.originNodeId } : {}),
        ...(query.destinationNodeId ? { destinationNodeId: query.destinationNodeId } : {}),
        ...(query.active === undefined ? {} : { active: query.active }),
        ...(q ? { OR: [
          { originNode: { code: { contains: q, mode: "insensitive" } } },
          { originNode: { publicName: { contains: q, mode: "insensitive" } } },
          { destinationNode: { code: { contains: q, mode: "insensitive" } } },
          { destinationNode: { publicName: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
      orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    return Promise.all(rows.map((row) => this.view(this.db, row)));
  }

  async get(laneId: string): Promise<LogisticsLaneView> {
    const lane = await this.db.logisticsLane.findUnique({ where: { id: laneId } });
    if (!lane) throw new ApiProblem(404, "NOT_FOUND", "Logistics lane not found.");
    return this.view(this.db, lane);
  }

  async create(actorId: string, idempotencyKey: string, input: LaneCreateInput, requestId: string): Promise<LogisticsLaneView> {
    const normalized = this.normalizeCreate(input);
    const operation = "logistics.lane.create";
    const requestHash = logisticsCommandHash(normalized);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different logistics lane command.");
        return this.parseReplay(replay.outcome);
      }
      await this.validateNodes(tx, normalized);
      let lane;
      try { lane = await tx.logisticsLane.create({ data: normalized }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") conflict("An equivalent active logistics lane already exists."); throw error; }
      const outcome = await this.view(tx, lane);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.lane.created", entityId: lane.id, requestId, details: { originNodeId: lane.originNodeId, destinationNodeId: lane.destinationNodeId, mode: lane.mode } } });
      await tx.outboxEvent.create({ data: { type: "logistics.lane.created", aggregateId: lane.id, payload: { laneId: lane.id, originNodeId: lane.originNodeId, destinationNodeId: lane.destinationNodeId, mode: lane.mode } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async update(actorId: string, laneId: string, idempotencyKey: string, input: LaneUpdateInput, requestId: string): Promise<LogisticsLaneView> {
    const normalized = this.normalizeUpdate(input);
    const operation = `logistics.lane.update:${laneId}`;
    const requestHash = logisticsCommandHash(normalized);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw new ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different logistics lane command.");
        return this.parseReplay(replay.outcome);
      }
      await tx.$queryRaw`SELECT id FROM "LogisticsLane" WHERE id=${laneId} FOR UPDATE`;
      const current = await tx.logisticsLane.findUnique({ where: { id: laneId } });
      if (!current) throw new ApiProblem(404, "NOT_FOUND", "Logistics lane not found.");
      const effective = { ...current, ...normalized } as LaneRecord;
      await this.validateNodes(tx, effective);
      if (normalized.active === false && current.active) {
        const dependentRules = await this.activeRouteRuleCount(tx, laneId);
        if (dependentRules) conflict("Deactivate route rules that use this lane before deactivating it.", { activeRouteRuleCount: dependentRules });
      }
      let lane;
      try { lane = await tx.logisticsLane.update({ where: { id: laneId }, data: normalized }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") conflict("An equivalent active logistics lane already exists."); throw error; }
      const outcome = await this.view(tx, lane);
      await tx.auditEvent.create({ data: { actorId, action: "logistics.lane.updated", entityId: lane.id, requestId, details: { originNodeId: lane.originNodeId, destinationNodeId: lane.destinationNodeId, active: lane.active } } });
      await tx.outboxEvent.create({ data: { type: "logistics.lane.updated", aggregateId: lane.id, payload: { laneId: lane.id, originNodeId: lane.originNodeId, destinationNodeId: lane.destinationNodeId, active: lane.active } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }
}
