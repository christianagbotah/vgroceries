import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { activateDeliveryRouteRuleRequestSchema, createDeliveryRouteRuleRequestSchema, replayKeySchema, routeDestinationKindSchema, routeSimulationRequestSchema, updateDeliveryRouteRuleRequestSchema } from "@variety/contracts";
import { z } from "zod";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";
const listSchema = z.object({ active: z.enum(["true","false"]).transform((v)=>v==="true").optional(), originNodeId: z.string().trim().min(1).max(128).optional(), fulfilment: z.enum(["delivery","collection"]).optional(), destinationKind: routeDestinationKindSchema.optional() }).strict();
@ApiExcludeController()
@Controller("admin/logistics/route-rules")
@UseGuards(AccessGuard)
export class AdminLogisticsRouteRulesController {
  constructor(private readonly routes: LogisticsRouteRuleService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403,"FORBIDDEN","Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T { const parsed=schema.safeParse(input); if(!parsed.success) throw new ApiProblem(400,"VALIDATION_FAILED",message,parsed.error.issues.map((issue:any)=>({path:issue.path.map(String).join("."),message:issue.message}))); return parsed.data as T; }
  private key(req: AuthRequest) { return this.parse<string>(replayKeySchema, req.get("idempotency-key"), "A valid Idempotency-Key header is required."); }
  @Get() async list(@Req() req: AuthRequest,@Query() query: unknown){this.requireAdmin(req);return{ok:true,data:await this.routes.list(this.parse<any>(listSchema,query,"Route rule query is invalid."))};}
  @Get(":ruleId") async detail(@Req() req: AuthRequest,@Param("ruleId") ruleId:string){this.requireAdmin(req);return{ok:true,data:await this.routes.get(ruleId)};}
  @Post() @HttpCode(200) async create(@Req() req:AuthRequest,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<any>(createDeliveryRouteRuleRequestSchema,body,"Route rule body is invalid.");return{ok:true,data:await this.routes.create(req.actor.id,this.key(req),input,req.requestId)};}
  @Post("simulate") @HttpCode(200) async simulate(@Req() req:AuthRequest,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<any>(routeSimulationRequestSchema,body,"Route simulation body is invalid.");return{ok:true,data:await this.routes.simulate(input)};}
  @Post(":ruleId/activate") @HttpCode(200) async activate(@Req() req:AuthRequest,@Param("ruleId") ruleId:string,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<any>(activateDeliveryRouteRuleRequestSchema,body,"Route activation body is invalid.");return{ok:true,data:await this.routes.activate(req.actor.id,ruleId,this.key(req),input,req.requestId)};}
  @Post(":ruleId") @HttpCode(200) async update(@Req() req:AuthRequest,@Param("ruleId") ruleId:string,@Body() body:unknown){this.requireAdmin(req);const input=this.parse<any>(updateDeliveryRouteRuleRequestSchema,body,"Route rule update is invalid.");return{ok:true,data:await this.routes.update(req.actor.id,ruleId,this.key(req),input,req.requestId)};}
}
