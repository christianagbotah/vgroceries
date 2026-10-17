import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  activateDeliveryRouteRuleRequestSchema,
  createDeliveryRouteRuleRequestSchema,
  deliveryRouteRuleViewSchema,
  routeSimulationRequestSchema,
  routeSimulationResponseSchema,
  updateDeliveryRouteRuleRequestSchema,
  type DeliveryRouteRuleView,
  type RouteSimulationCandidate,
  type RouteSimulationRequest,
  type RouteSimulationResponse,
} from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { logisticsCommandHash, normalizeMatchText } from "./logistics.values";

type Tx = Prisma.TransactionClient;
type RuleGraph = Prisma.DeliveryRouteRuleGetPayload<{ include: { stops: { include: { node: true } }; legs: { include: { lane: true } } } }>;
type StopInput = { position: number; nodeId: string; terminalRole: string };
type LegInput = { position: number; laneId: string };
type NormalizedRule = {
  name: string; originNodeId: string; deliveryZoneId: string | null; fulfilment: string; locality: string | null;
  destinationKind: string; finalPickupNodeId: string | null; serviceLevel: string | null; workflowVersionId: string;
  priority: number; effectiveFrom: Date | null; effectiveTo: Date | null; stops: StopInput[]; legs: LegInput[];
};
type ListQuery = { active?: boolean; originNodeId?: string; fulfilment?: "delivery"|"collection"; destinationKind?: "doorstep"|"pickup_point" };

function conflict(message: string, code = "CONFLICT"): never { throw new ApiProblem(409, code, message); }
function invalid(message: string, details?: unknown): never { throw new ApiProblem(400, "VALIDATION_FAILED", message, details); }
function ruleViolation(message: string): never { throw new ApiProblem(422, "RULE_VIOLATION", message); }

@Injectable()
export class LogisticsRouteRuleService {
  constructor(private readonly db: Database) {}

  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) invalid(message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }

  private async advisory(tx: Tx, actorId: string, operation: string, key: string) {
    const lockKey = JSON.stringify([actorId, operation, key]);
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private normalizeCreate(input: unknown): NormalizedRule {
    const parsed = this.parse<any>(createDeliveryRouteRuleRequestSchema, input, "Route rule body is invalid.");
    return this.normalizeRule(parsed);
  }

  private normalizeRule(parsed: any): NormalizedRule {
    const effectiveFrom = parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : null;
    const effectiveTo = parsed.effectiveTo ? new Date(parsed.effectiveTo) : null;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) invalid("Route rule effective end cannot precede its start.");
    return {
      name: parsed.name.trim().replace(/\s+/g, " "),
      originNodeId: parsed.originNodeId.trim(),
      deliveryZoneId: parsed.deliveryZoneId?.trim() || null,
      fulfilment: parsed.fulfilment,
      locality: normalizeMatchText(parsed.locality),
      destinationKind: parsed.destinationKind,
      finalPickupNodeId: parsed.finalPickupNodeId?.trim() || null,
      serviceLevel: normalizeMatchText(parsed.serviceLevel),
      workflowVersionId: parsed.workflowVersionId.trim(),
      priority: parsed.priority ?? 0,
      effectiveFrom, effectiveTo,
      stops: [...parsed.stops].map((stop: any) => ({ position: stop.position, nodeId: stop.nodeId.trim(), terminalRole: stop.terminalRole })).sort((a,b) => a.position-b.position),
      legs: [...(parsed.legs ?? [])].map((leg: any) => ({ position: leg.position, laneId: leg.laneId.trim() })).sort((a,b) => a.position-b.position),
    };
  }

  private graphAsNormalized(rule: RuleGraph): NormalizedRule {
    return {
      name: rule.name, originNodeId: rule.originNodeId, deliveryZoneId: rule.deliveryZoneId, fulfilment: rule.fulfilment,
      locality: rule.locality, destinationKind: rule.destinationKind, finalPickupNodeId: rule.finalPickupNodeId,
      serviceLevel: rule.serviceLevel, workflowVersionId: rule.workflowVersionId, priority: rule.priority,
      effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo,
      stops: [...rule.stops].sort((a,b) => a.position-b.position).map((stop) => ({ position: stop.position, nodeId: stop.nodeId, terminalRole: stop.terminalRole })),
      legs: [...rule.legs].sort((a,b) => a.position-b.position).map((leg) => ({ position: leg.position, laneId: leg.laneId })),
    };
  }

  private async getGraph(tx: Tx | Database, ruleId: string): Promise<RuleGraph> {
    const rule = await tx.deliveryRouteRule.findUnique({
      where: { id: ruleId },
      include: { stops: { include: { node: true }, orderBy: { position: "asc" } }, legs: { include: { lane: true }, orderBy: { position: "asc" } } },
    });
    if (!rule) throw new ApiProblem(404, "NOT_FOUND", "Delivery route rule not found.");
    return rule;
  }

  private routeView(rule: RuleGraph): DeliveryRouteRuleView {
    return deliveryRouteRuleViewSchema.parse({
      id: rule.id, name: rule.name, originNodeId: rule.originNodeId, deliveryZoneId: rule.deliveryZoneId,
      fulfilment: rule.fulfilment, locality: rule.locality, destinationKind: rule.destinationKind,
      finalPickupNodeId: rule.finalPickupNodeId, serviceLevel: rule.serviceLevel, workflowVersionId: rule.workflowVersionId,
      priority: rule.priority, effectiveFrom: rule.effectiveFrom?.toISOString() ?? null, effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      stops: [...rule.stops].sort((a,b) => a.position-b.position).map((stop) => ({ id: stop.id, position: stop.position, nodeId: stop.nodeId, terminalRole: stop.terminalRole })),
      legs: [...rule.legs].sort((a,b) => a.position-b.position).map((leg) => ({ id: leg.id, position: leg.position, laneId: leg.laneId, originStopId: leg.originStopId, destinationStopId: leg.destinationStopId })),
      active: rule.active, version: rule.version, createdBy: rule.createdBy,
      createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString(),
    });
  }

  private parseReplay(outcome: Prisma.JsonValue): DeliveryRouteRuleView {
    const parsed = deliveryRouteRuleViewSchema.safeParse(outcome);
    if (!parsed.success) conflict("Route rule replay state is incomplete.");
    return parsed.data;
  }

  private async validateStructure(tx: Tx, rule: NormalizedRule) {
    if (rule.fulfilment === "delivery") {
      if (!rule.deliveryZoneId) ruleViolation("Delivery route rules require a delivery zone.");
      const zone = await tx.deliveryZone.findUnique({ where: { id: rule.deliveryZoneId }, select: { active: true } });
      if (!zone || !zone.active) ruleViolation("Delivery route rules require an active delivery zone.");
    } else if (rule.deliveryZoneId) ruleViolation("Source collection route rules cannot use a delivery zone.");

    if (rule.destinationKind === "pickup_point" && !rule.finalPickupNodeId) ruleViolation("Remote pickup routes require a final pickup node.");
    if (rule.destinationKind === "doorstep" && rule.finalPickupNodeId) ruleViolation("Doorstep routes cannot set a final pickup node.");
    if (rule.fulfilment === "collection" && rule.destinationKind !== "doorstep") ruleViolation("Source collection uses the direct no-final-destination route shape.");

    const workflow = await tx.deliveryWorkflowVersion.findUnique({ where: { id: rule.workflowVersionId }, select: { status: true } });
    if (!workflow || workflow.status !== "published") ruleViolation("Route rules must pin a published workflow version.");

    if (!rule.stops.length) ruleViolation("A route rule requires at least one stop.");
    for (let index=0; index<rule.stops.length; index++) if (rule.stops[index]!.position !== index+1) ruleViolation("Route stop positions must be contiguous starting at 1.");
    if (rule.stops[0]!.nodeId !== rule.originNodeId) ruleViolation("The first route stop must be the rule origin node.");
    if (new Set(rule.stops.map((stop) => stop.nodeId)).size !== rule.stops.length) ruleViolation("Active route paths cannot repeat a node or contain a cycle.");
    const nodeIds = [...new Set([...rule.stops.map((stop) => stop.nodeId), rule.originNodeId, ...(rule.finalPickupNodeId ? [rule.finalPickupNodeId] : [])])];
    const nodes = await tx.logisticsNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, active: true } });
    if (nodes.length !== nodeIds.length || nodes.some((node) => !node.active)) ruleViolation("Route rules require every referenced logistics node to be active.");

    const last = rule.stops.at(-1)!;
    if (rule.fulfilment === "collection") {
      if (rule.stops.length !== 1 || rule.legs.length !== 0 || last.nodeId !== rule.originNodeId || last.terminalRole !== "customer_pickup") ruleViolation("Source collection must be one origin stop with customer pickup and zero lanes.");
    } else if (rule.destinationKind === "pickup_point") {
      if (last.nodeId !== rule.finalPickupNodeId || last.terminalRole !== "customer_pickup") ruleViolation("Remote pickup routes must end at the configured pickup node with customer_pickup terminal role.");
    } else if (last.terminalRole !== "final_mile_dispatch") ruleViolation("Doorstep routes must end at a final_mile_dispatch stop.");
    for (const stop of rule.stops.slice(0,-1)) if (stop.terminalRole !== "transit") ruleViolation("Only the terminal route stop may use a terminal role.");

    const expectedLegs = Math.max(0, rule.stops.length - 1);
    if (rule.legs.length !== expectedLegs) ruleViolation("Multi-stop routes require exactly one lane for every adjacent stop pair.");
    for (let index=0; index<rule.legs.length; index++) if (rule.legs[index]!.position !== index+1) ruleViolation("Route leg positions must be contiguous starting at 1.");
    if (rule.legs.length) {
      const laneIds = rule.legs.map((leg) => leg.laneId);
      const lanes = await tx.logisticsLane.findMany({ where: { id: { in: laneIds } } });
      const byId = new Map(lanes.map((lane) => [lane.id, lane]));
      for (let index=0; index<rule.legs.length; index++) {
        const lane = byId.get(rule.legs[index]!.laneId);
        const origin = rule.stops[index]!; const destination = rule.stops[index+1]!;
        if (!lane || !lane.active) ruleViolation("Every route leg must use an active logistics lane.");
        if (lane.originNodeId !== origin.nodeId || lane.destinationNodeId !== destination.nodeId) ruleViolation("Every route lane must match its adjacent stop endpoints.");
      }
    }
  }

  private async lockDependencies(tx: Tx, rule: NormalizedRule) {
    const nodeIds = [...new Set([...rule.stops.map((stop) => stop.nodeId), rule.originNodeId, ...(rule.finalPickupNodeId ? [rule.finalPickupNodeId] : [])])].sort();
    if (nodeIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "LogisticsNode" WHERE id IN (${Prisma.join(nodeIds)}) ORDER BY id FOR UPDATE`);
    const laneIds = [...new Set(rule.legs.map((leg) => leg.laneId))].sort();
    if (laneIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "LogisticsLane" WHERE id IN (${Prisma.join(laneIds)}) ORDER BY id FOR UPDATE`);
    await tx.$queryRaw`SELECT id FROM "DeliveryWorkflowVersion" WHERE id=${rule.workflowVersionId} FOR UPDATE`;
    if (rule.deliveryZoneId) await tx.$queryRaw`SELECT id FROM "DeliveryZone" WHERE id=${rule.deliveryZoneId} FOR UPDATE`;
  }

  private async persistGraph(tx: Tx, ruleId: string, rule: NormalizedRule) {
    const stopIds = new Map<number,string>();
    for (const stop of rule.stops) {
      const created = await tx.deliveryRouteRuleStop.create({ data: { ruleId, position: stop.position, nodeId: stop.nodeId, terminalRole: stop.terminalRole } });
      stopIds.set(stop.position, created.id);
    }
    for (const leg of rule.legs) {
      const originStopId = stopIds.get(leg.position); const destinationStopId = stopIds.get(leg.position+1);
      if (!originStopId || !destinationStopId) ruleViolation("Route leg does not have matching adjacent stops.");
      await tx.deliveryRouteRuleLeg.create({ data: { ruleId, position: leg.position, originStopId, destinationStopId, laneId: leg.laneId } });
    }
  }

  async list(query: ListQuery): Promise<DeliveryRouteRuleView[]> {
    const rows = await this.db.deliveryRouteRule.findMany({
      where: { ...(query.active===undefined?{}:{active:query.active}), ...(query.originNodeId?{originNodeId:query.originNodeId}:{}), ...(query.fulfilment?{fulfilment:query.fulfilment}:{}), ...(query.destinationKind?{destinationKind:query.destinationKind}:{}) },
      include: { stops: { include: { node: true }, orderBy: { position: "asc" } }, legs: { include: { lane: true }, orderBy: { position: "asc" } } },
      orderBy: [{ active: "desc" }, { priority: "desc" }, { name: "asc" }, { id: "asc" }], take: 100,
    });
    return rows.map((row) => this.routeView(row));
  }

  async get(ruleId: string): Promise<DeliveryRouteRuleView> { return this.routeView(await this.getGraph(this.db, ruleId)); }

  async create(actorId: string, idempotencyKey: string, input: unknown, requestId: string): Promise<DeliveryRouteRuleView> {
    const normalized = this.normalizeCreate(input);
    const operation = "logistics.route_rule.create"; const requestHash = logisticsCommandHash(normalized);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Idempotency key already belongs to another route command."); return this.parseReplay(replay.outcome); }
      await this.validateStructure(tx, normalized);
      const created = await tx.deliveryRouteRule.create({ data: { name: normalized.name, originNodeId: normalized.originNodeId, deliveryZoneId: normalized.deliveryZoneId, fulfilment: normalized.fulfilment, locality: normalized.locality, destinationKind: normalized.destinationKind, finalPickupNodeId: normalized.finalPickupNodeId, serviceLevel: normalized.serviceLevel, workflowVersionId: normalized.workflowVersionId, priority: normalized.priority, effectiveFrom: normalized.effectiveFrom, effectiveTo: normalized.effectiveTo, active: false, version: 1, createdBy: actorId } });
      await this.persistGraph(tx, created.id, normalized);
      const outcome = this.routeView(await this.getGraph(tx, created.id));
      await tx.auditEvent.create({ data: { actorId, action: "logistics.route_rule.created", entityId: created.id, requestId, details: { originNodeId: created.originNodeId, priority: created.priority } } });
      await tx.outboxEvent.create({ data: { type: "logistics.route_rule.created", aggregateId: created.id, payload: { ruleId: created.id, originNodeId: created.originNodeId, priority: created.priority } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  async update(actorId: string, ruleId: string, idempotencyKey: string, input: unknown, requestId: string): Promise<DeliveryRouteRuleView> {
    const parsed = this.parse<any>(updateDeliveryRouteRuleRequestSchema, input, "Route rule update is invalid.");
    const operation = `logistics.route_rule.update:${ruleId}`; const requestHash = logisticsCommandHash(parsed);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Idempotency key already belongs to another route command."); return this.parseReplay(replay.outcome); }
      await tx.$queryRaw`SELECT id FROM "DeliveryRouteRule" WHERE id=${ruleId} FOR UPDATE`;
      const current = await this.getGraph(tx, ruleId);
      if (current.version !== parsed.expectedVersion) conflict("This route rule changed elsewhere. Reload before saving.");
      const contentKeys = Object.keys(parsed).filter((key) => !["expectedVersion","active"].includes(key));
      if (current.active) {
        if (parsed.active !== false || contentKeys.length) conflict("Active route rules are read-only; deactivate before editing configuration.");
        const updated = await tx.deliveryRouteRule.update({ where: { id: ruleId }, data: { active: false, version: { increment: 1 } } });
        const outcome = this.routeView(await this.getGraph(tx, ruleId));
        await tx.auditEvent.create({ data: { actorId, action: "logistics.route_rule.deactivated", entityId: ruleId, requestId, details: { version: updated.version } } });
        await tx.outboxEvent.create({ data: { type: "logistics.route_rule.deactivated", aggregateId: ruleId, payload: { ruleId, version: updated.version } } });
        await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
        return outcome;
      }
      if (parsed.active === true) conflict("Use the activate command so dependencies and ambiguity are revalidated.");
      if ((parsed.stops !== undefined) !== (parsed.legs !== undefined)) invalid("Route stops and legs must be saved together.");
      const base = this.graphAsNormalized(current);
      const effectiveRaw: any = {
        ...base,
        ...parsed,
        originNodeId: current.originNodeId,
        fulfilment: current.fulfilment,
        deliveryZoneId: parsed.deliveryZoneId !== undefined ? parsed.deliveryZoneId : current.deliveryZoneId,
        destinationKind: parsed.destinationKind !== undefined ? parsed.destinationKind : current.destinationKind,
        finalPickupNodeId: parsed.finalPickupNodeId !== undefined ? parsed.finalPickupNodeId : current.finalPickupNodeId,
        locality: parsed.locality !== undefined ? parsed.locality : current.locality,
        serviceLevel: parsed.serviceLevel !== undefined ? parsed.serviceLevel : current.serviceLevel,
        workflowVersionId: parsed.workflowVersionId ?? current.workflowVersionId,
        effectiveFrom: parsed.effectiveFrom !== undefined ? parsed.effectiveFrom : current.effectiveFrom?.toISOString(),
        effectiveTo: parsed.effectiveTo !== undefined ? parsed.effectiveTo : current.effectiveTo?.toISOString(),
        stops: parsed.stops ?? base.stops,
        legs: parsed.legs ?? base.legs,
      };
      const normalized = this.normalizeRule(effectiveRaw);
      await this.validateStructure(tx, normalized);
      await tx.deliveryRouteRule.update({ where: { id: ruleId }, data: { name: normalized.name, deliveryZoneId: normalized.deliveryZoneId, locality: normalized.locality, destinationKind: normalized.destinationKind, finalPickupNodeId: normalized.finalPickupNodeId, serviceLevel: normalized.serviceLevel, workflowVersionId: normalized.workflowVersionId, priority: normalized.priority, effectiveFrom: normalized.effectiveFrom, effectiveTo: normalized.effectiveTo, active: false, version: { increment: 1 } } });
      if (parsed.stops !== undefined) { await tx.deliveryRouteRuleLeg.deleteMany({ where: { ruleId } }); await tx.deliveryRouteRuleStop.deleteMany({ where: { ruleId } }); await this.persistGraph(tx, ruleId, normalized); }
      const outcome = this.routeView(await this.getGraph(tx, ruleId));
      await tx.auditEvent.create({ data: { actorId, action: "logistics.route_rule.updated", entityId: ruleId, requestId, details: { priority: normalized.priority, version: outcome.version } } });
      await tx.outboxEvent.create({ data: { type: "logistics.route_rule.updated", aggregateId: ruleId, payload: { ruleId, priority: normalized.priority, version: outcome.version } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  private selectorsOverlap(a: string | null, b: string | null) { return a === null || b === null || a === b; }
  private windowsOverlap(aFrom: Date | null, aTo: Date | null, bFrom: Date | null, bTo: Date | null) {
    return (!aTo || !bFrom || aTo >= bFrom) && (!bTo || !aFrom || bTo >= aFrom);
  }

  private async assertNoActivationAmbiguity(tx: Tx, ruleId: string, rule: NormalizedRule) {
    const others = await tx.deliveryRouteRule.findMany({ where: { id: { not: ruleId }, active: true, priority: rule.priority, originNodeId: rule.originNodeId, fulfilment: rule.fulfilment, deliveryZoneId: rule.deliveryZoneId, destinationKind: rule.destinationKind, finalPickupNodeId: rule.finalPickupNodeId } });
    const conflictRule = others.find((other) => this.selectorsOverlap(rule.locality, other.locality) && this.selectorsOverlap(rule.serviceLevel, other.serviceLevel) && this.windowsOverlap(rule.effectiveFrom, rule.effectiveTo, other.effectiveFrom, other.effectiveTo));
    if (conflictRule) conflict(`Route activation would be ambiguous with '${conflictRule.name}' at the same priority.`, "LOGISTICS_ROUTE_AMBIGUOUS");
  }

  async activate(actorId: string, ruleId: string, idempotencyKey: string, input: unknown, requestId: string): Promise<DeliveryRouteRuleView> {
    const parsed = this.parse<any>(activateDeliveryRouteRuleRequestSchema, input, "Route activation body is invalid.");
    const operation = `logistics.route_rule.activate:${ruleId}`; const requestHash = logisticsCommandHash(parsed);
    return this.db.$transaction(async (tx) => {
      await this.advisory(tx, actorId, operation, idempotencyKey);
      const replay = await tx.idempotency.findUnique({ where: { actorId_operation_key: { actorId, operation, key: idempotencyKey } } });
      if (replay) { if (replay.requestHash !== requestHash) throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Idempotency key already belongs to another route command."); return this.parseReplay(replay.outcome); }
      await tx.$queryRaw`SELECT id FROM "DeliveryRouteRule" WHERE id=${ruleId} FOR UPDATE`;
      const current = await this.getGraph(tx, ruleId);
      if (current.version !== parsed.expectedVersion) conflict("This route rule changed elsewhere. Reload before activation.");
      if (current.active) conflict("Route rule is already active.");
      const normalized = this.graphAsNormalized(current);
      await this.lockDependencies(tx, normalized);
      await this.validateStructure(tx, normalized);
      await this.assertNoActivationAmbiguity(tx, ruleId, normalized);
      const updated = await tx.deliveryRouteRule.update({ where: { id: ruleId }, data: { active: true, version: { increment: 1 } } });
      const outcome = this.routeView(await this.getGraph(tx, ruleId));
      await tx.auditEvent.create({ data: { actorId, action: "logistics.route_rule.activated", entityId: ruleId, requestId, details: { priority: updated.priority, version: updated.version } } });
      await tx.outboxEvent.create({ data: { type: "logistics.route_rule.activated", aggregateId: ruleId, payload: { ruleId, priority: updated.priority, version: updated.version } } });
      await tx.idempotency.create({ data: { actorId, operation, key: idempotencyKey, requestHash, outcome } });
      return outcome;
    });
  }

  private candidate(rule: RuleGraph): RouteSimulationCandidate {
    return {
      ruleId: rule.id, name: rule.name, priority: rule.priority, workflowVersionId: rule.workflowVersionId,
      destinationKind: rule.destinationKind as any,
      stops: [...rule.stops].sort((a,b)=>a.position-b.position).map((stop) => ({ position: stop.position, nodeId: stop.nodeId, nodeCode: stop.node.code, nodePublicName: stop.node.publicName, terminalRole: stop.terminalRole as any })),
      legs: [...rule.legs].sort((a,b)=>a.position-b.position).map((leg) => ({ position: leg.position, laneId: leg.laneId, mode: leg.lane.mode as any, originNodeId: leg.lane.originNodeId, destinationNodeId: leg.lane.destinationNodeId })),
    };
  }

  async simulate(input: RouteSimulationRequest): Promise<RouteSimulationResponse> {
    const parsed = this.parse<any>(routeSimulationRequestSchema, input, "Route simulation body is invalid.");
    if (parsed.fulfilment === "delivery" && !parsed.deliveryZoneId) invalid("Delivery simulation requires a delivery zone.");
    if (parsed.fulfilment === "collection" && parsed.deliveryZoneId) invalid("Collection simulation cannot use a delivery zone.");
    const locality = normalizeMatchText(parsed.locality); const serviceLevel = normalizeMatchText(parsed.serviceLevel);
    const at = parsed.at ? new Date(parsed.at) : new Date();
    const rows = await this.db.deliveryRouteRule.findMany({
      where: {
        active: true, originNodeId: parsed.originNodeId, fulfilment: parsed.fulfilment,
        deliveryZoneId: parsed.fulfilment === "delivery" ? parsed.deliveryZoneId : null,
        destinationKind: parsed.destinationKind, finalPickupNodeId: parsed.destinationKind === "pickup_point" ? parsed.finalPickupNodeId : null,
        AND: [
          locality ? { OR: [{ locality: null }, { locality }] } : { locality: null },
          serviceLevel ? { OR: [{ serviceLevel: null }, { serviceLevel }] } : { serviceLevel: null },
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] },
        ],
      },
      include: { stops: { include: { node: true }, orderBy: { position: "asc" } }, legs: { include: { lane: true }, orderBy: { position: "asc" } } },
      orderBy: [{ priority: "desc" }, { id: "asc" }], take: 50,
    });
    if (!rows.length) return routeSimulationResponseSchema.parse({ status: "no_match", candidates: [] });
    const topPriority = rows[0]!.priority;
    const candidates = rows.filter((row) => row.priority === topPriority).map((row) => this.candidate(row));
    if (candidates.length > 1) return routeSimulationResponseSchema.parse({ status: "ambiguous", candidates });
    return routeSimulationResponseSchema.parse({ status: "matched", selectedRule: candidates[0]!, candidates });
  }

  async resolve(context: Omit<RouteSimulationRequest,"at">, at: Date): Promise<RouteSimulationCandidate> {
    const result = await this.simulate({ ...context, at: at.toISOString() });
    if (result.status === "no_match") throw new ApiProblem(422, "LOGISTICS_ROUTE_NOT_CONFIGURED", "No active logistics route matches this order context.");
    if (result.status === "ambiguous") throw new ApiProblem(409, "LOGISTICS_ROUTE_AMBIGUOUS", "Multiple active logistics routes have equal authority for this order context.");
    return result.selectedRule;
  }
}
