import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import { replayKeySchema, type AdminOrderFilters } from "@variety/contracts";
import { orderNoteRequestSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { AdminOrderQueryService } from "./admin-order-query.service";

@ApiTags("admin-orders")
@ApiCookieAuth()
@Controller("admin/orders")
@UseGuards(AccessGuard)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrderQueryService) {}

  private requireAdmin(req: AuthRequest) {
    if (req.actor.role !== "admin")
      throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "List administrator order rows" })
  async list(@Req() req: AuthRequest, @Query() query: AdminOrderFilters) {
    this.requireAdmin(req);
    return { ok: true, data: await this.orders.list(query) };
  }

  // Internal staff portal operation, not a public SDK endpoint.
  @Post(":orderId/notes")
  @ApiExcludeEndpoint()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async note(@Req() req: AuthRequest,@Param("orderId") orderId:string,@Body() body:unknown){
    this.requireAdmin(req);
    const input=orderNoteRequestSchema.safeParse(body),key=replayKeySchema.safeParse(req.get("idempotency-key"));
    if(!input.success||!key.success)throw new ApiProblem(400,"VALIDATION_FAILED","Enter a valid note and request identity.");
    return {ok:true,data:await this.orders.addNote(orderId,req.actor.id,req.requestId,key.data,input.data)};
  }

  @Get(":orderId")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Read administrator order detail" })
  async detail(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    this.requireAdmin(req);
    return { ok: true, data: await this.orders.detail(orderId) };
  }
}
