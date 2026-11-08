import { Inject, Injectable } from "@nestjs/common";
import { checkoutPickupOptionsResponseSchema, type CheckoutPickupOptionsResponse } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";

/** Public choices are a projection of server-owned active routes, never editable route authority. */
@Injectable()
export class CheckoutPickupPointsService {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly routes: LogisticsRouteRuleService,
  ) {}

  async list(zoneId: string, locality?: string): Promise<CheckoutPickupOptionsResponse> {
    if (!this.config.customerPickupEnabled) {
      return checkoutPickupOptionsResponseSchema.parse({ enabled: false, points: [] });
    }
    if (!zoneId || zoneId.length > 128 || (locality && locality.length > 120)) {
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid pickup option query.");
    }
    const zone = await this.db.deliveryZone.findUnique({ where: { id: zoneId }, select: { active: true, feeMinor: true } });
    if (!zone?.active) throw new ApiProblem(404, "NOT_FOUND", "Delivery zone not available.");
    const source = this.config.commerce && await this.db.logisticsNode.findFirst({
      where: { active: true, inventoryLocationId: this.config.commerce.locationId },
      select: { id: true },
    });
    if (!source) return checkoutPickupOptionsResponseSchema.parse({ enabled: true, points: [] });
    const now = new Date();
    const rules = await this.db.deliveryRouteRule.findMany({
      where: {
        active: true, originNodeId: source.id, deliveryZoneId: zoneId,
        fulfilment: "delivery", destinationKind: "pickup_point",
        serviceLevel: null,
        finalPickupNode: { active: true, customerVisible: true, kind: "pickup_point" },
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
          locality?.trim()
            ? { OR: [{ locality: null }, { locality: locality.trim().toLowerCase().replace(/\s+/g, " ") }] }
            : { locality: null },
        ],
      },
      include: { finalPickupNode: true },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
      take: 200,
    });
    const choices = new Map<string, CheckoutPickupOptionsResponse["points"][number]>();
    for (const rule of rules) {
      const node = rule.finalPickupNode;
      if (!node || choices.has(node.id)) continue;
      try {
        await this.routes.resolve({
          originNodeId: source.id, fulfilment: "delivery",
          deliveryZoneId: zoneId, destinationKind: "pickup_point",
          finalPickupNodeId: node.id, locality: locality?.trim() || undefined,
        }, now);
      } catch (error) {
        if (error instanceof ApiProblem && [409, 422].includes(error.getStatus())) continue;
        throw error;
      }
      choices.set(node.id, {
        id: node.id,
        name: node.publicName,
        kindLabel: node.kindLabel ?? null,
        locality: node.locality ?? null,
        region: node.region ?? null,
        addressLine: node.addressLine ?? null,
        ghanaPostGps: node.ghanaPostGps ?? null,
        directions: node.publicDirections ?? null,
        contact: node.publicContact ?? null,
        feeMinor: node.pickupFeeMinor ?? zone.feeMinor,
        feeBasis: node.pickupFeeMinor === null ? "zone_delivery" : "centre_pickup",
      });
    }
    return checkoutPickupOptionsResponseSchema.parse({
      enabled: true,
      points: [...choices.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    });
  }
}
