import { Inject, Injectable } from "@nestjs/common";
import type { CheckoutPickupOptionView } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

@Injectable()
export class CheckoutPickupOptionsService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private graphIsCustomerSafe(rule: Awaited<ReturnType<CheckoutPickupOptionsService["candidateRules"]>>[number]) {
    const pickup = rule.finalPickupNode;
    if (!pickup?.active || !pickup.customerVisible) return false;
    const stops = [...rule.stops].sort((a, b) => a.position - b.position);
    const legs = [...rule.legs].sort((a, b) => a.position - b.position);
    if (!stops.length || stops[0]!.nodeId !== rule.originNodeId) return false;
    if (stops.at(-1)?.nodeId !== rule.finalPickupNodeId || stops.at(-1)?.terminalRole !== "customer_pickup") return false;
    if (stops.some((stop, index) => stop.position !== index + 1 || !stop.node.active || (index < stops.length - 1 && stop.terminalRole !== "transit"))) return false;
    if (legs.length !== Math.max(0, stops.length - 1)) return false;
    return legs.every((leg, index) => {
      const origin = stops[index];
      const destination = stops[index + 1];
      return leg.position === index + 1 && leg.lane.active && Boolean(origin) && Boolean(destination)
        && leg.lane.originNodeId === origin!.nodeId && leg.lane.destinationNodeId === destination!.nodeId;
    });
  }

  private candidateRules(originNodeId: string, zoneId: string, now: Date) {
    return this.db.deliveryRouteRule.findMany({
      where: {
        active: true,
        originNodeId,
        deliveryZoneId: zoneId,
        fulfilment: "delivery",
        destinationKind: "pickup_point",
        locality: null,
        serviceLevel: null,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        ],
      },
      include: {
        finalPickupNode: true,
        workflowVersion: { select: { status: true } },
        stops: { include: { node: true }, orderBy: { position: "asc" } },
        legs: { include: { lane: true }, orderBy: { position: "asc" } },
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    });
  }

  async list(rawZoneId: string): Promise<CheckoutPickupOptionView[]> {
    const zoneId = rawZoneId?.trim();
    if (!zoneId) throw new ApiProblem(400, "VALIDATION_FAILED", "A delivery zone is required to list pickup centres.");
    if (!this.config.logisticsShipmentExecutionEnabled || !this.config.commerce) return [];

    const [zone, origin] = await Promise.all([
      this.db.deliveryZone.findUnique({ where: { id: zoneId }, select: { active: true } }),
      this.db.logisticsNode.findUnique({
        where: { inventoryLocationId: this.config.commerce.locationId },
        select: { id: true, active: true },
      }),
    ]);
    if (!zone?.active || !origin?.active) return [];

    const rules = await this.candidateRules(origin.id, zoneId, new Date());
    const options = new Map<string, CheckoutPickupOptionView>();
    for (const rule of rules) {
      if (rule.workflowVersion.status !== "published" || !this.graphIsCustomerSafe(rule)) continue;
      const node = rule.finalPickupNode!;
      if (!options.has(node.id)) {
        options.set(node.id, {
          nodeId: node.id,
          publicName: node.publicName,
          addressLine: node.addressLine,
          locality: node.locality,
          region: node.region,
          ghanaPostGps: node.ghanaPostGps,
          publicDirections: node.publicDirections,
          publicContact: node.publicContact,
        });
      }
    }
    return [...options.values()].sort((a, b) => a.publicName.localeCompare(b.publicName) || a.nodeId.localeCompare(b.nodeId));
  }
}
