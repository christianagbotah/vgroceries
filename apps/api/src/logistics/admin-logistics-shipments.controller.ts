import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { planShipmentRequestSchema, replayKeySchema, pickupCollectRequestSchema, type PickupCollectRequest, shipmentArriveRequestSchema, shipmentCheckpointRequestSchema, shipmentDepartRequestSchema, shipmentRerouteRequestSchema, type PlanShipmentRequest, type ShipmentArriveRequest, type ShipmentCheckpointRequest, type ShipmentDepartRequest, type ShipmentRerouteRequest } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { ShipmentPlanningService } from "./shipment-planning.service";
import { ShipmentExecutionService } from "./shipment-execution.service";
import { ShipmentCollectionService } from "./shipment-collection.service";
import { ShipmentQueryService } from "./shipment-query.service";

@ApiExcludeController()
@Controller("admin/logistics")
@UseGuards(AccessGuard)
export class AdminLogisticsShipmentsController {
  constructor(private readonly planning: ShipmentPlanningService, private readonly execution: ShipmentExecutionService, private readonly query: ShipmentQueryService, private readonly collection: ShipmentCollectionService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }
  private key(req: AuthRequest) { return this.parse<string>(replayKeySchema, req.get("idempotency-key"), "A valid Idempotency-Key header is required."); }

  @Get("shipments")
  async list(@Req() req:AuthRequest,@Query() query:unknown){this.requireAdmin(req);return{ok:true,data:await this.query.list(query)};}

  @Get("shipments/:shipmentId")
  async detail(@Req() req:AuthRequest,@Param("shipmentId") shipmentId:string){this.requireAdmin(req);return{ok:true,data:await this.query.get(shipmentId)};}

  @Post("orders/:orderId/plan")
  @HttpCode(200)
  async plan(@Req() req: AuthRequest, @Param("orderId") orderId: string, @Body() body: unknown) {
    this.requireAdmin(req);
    const input = this.parse<PlanShipmentRequest>(planShipmentRequestSchema, body, "Shipment planning body is invalid.");
    return { ok: true, data: await this.planning.planLegacy(orderId, req.actor.id, this.key(req), input, req.requestId) };
  }

  @Post("shipments/:shipmentId/depart")
  @HttpCode(200)
  async depart(@Req() req:AuthRequest,@Param("shipmentId") shipmentId:string,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<ShipmentDepartRequest>(shipmentDepartRequestSchema,body,"Shipment departure body is invalid.");return {ok:true,data:await this.execution.depart(shipmentId,req.actor.id,this.key(req),input,req.requestId)};}

  @Post("shipments/:shipmentId/arrive")
  @HttpCode(200)
  async arrive(@Req() req:AuthRequest,@Param("shipmentId") shipmentId:string,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<ShipmentArriveRequest>(shipmentArriveRequestSchema,body,"Shipment arrival body is invalid.");return {ok:true,data:await this.execution.arrive(shipmentId,req.actor.id,this.key(req),input,req.requestId)};}

  @Post("shipments/:shipmentId/checkpoints")
  @HttpCode(200)
  async checkpoint(@Req() req:AuthRequest,@Param("shipmentId") shipmentId:string,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<ShipmentCheckpointRequest>(shipmentCheckpointRequestSchema,body,"Shipment checkpoint body is invalid.");return {ok:true,data:await this.execution.checkpoint(shipmentId,req.actor.id,this.key(req),input,req.requestId)};}

  @Post("shipments/:shipmentId/collect")
  @HttpCode(200)
  async collect(@Req() req:AuthRequest,@Param("shipmentId") shipmentId:string,@Body() body:unknown) {
    this.requireAdmin(req);
    const input=this.parse<PickupCollectRequest>(pickupCollectRequestSchema,body,"Customer pickup proof is invalid.");
    return {ok:true,data:await this.collection.collect(shipmentId,req.actor.id,this.key(req),input,req.requestId)};
  }

  @Post("shipments/:shipmentId/reroute")
  @HttpCode(200)
  async reroute(@Req() req:AuthRequest,@Param("shipmentId") shipmentId:string,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<ShipmentRerouteRequest>(shipmentRerouteRequestSchema,body,"Shipment reroute body is invalid.");return {ok:true,data:await this.execution.reroute(shipmentId,req.actor.id,this.key(req),input,req.requestId)};}


}
