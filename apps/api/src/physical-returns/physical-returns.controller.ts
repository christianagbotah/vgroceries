import { Body,Controller,Get,HttpCode,Param,Post,Query,Req,UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { physicalReturnReceiveSchema,physicalReturnInspectSchema,
  physicalReturnQuerySchema,replayKeySchema,
  type PhysicalReturnReceive,type PhysicalReturnInspect } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { PhysicalReturnsService } from "./physical-returns.service";

@ApiTags("physical-returns")
@Controller("admin/physical-returns")
@UseGuards(AccessGuard)
export class PhysicalReturnsController {
  constructor(private readonly returns:PhysicalReturnsService){}
  private requireAdmin(req:AuthRequest){
    if(req.actor.role!=="admin")
      throw new ApiProblem(403,"FORBIDDEN","Physical returns require administrator access.");
  }
  private key(req:AuthRequest){
    const result=replayKeySchema.safeParse(req.get("idempotency-key"));
    if(!result.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "A valid Idempotency-Key is required.");
    return result.data;
  }
  @Get()
  async list(@Req() req:AuthRequest,@Query() query:unknown){
    this.requireAdmin(req);
    const parsed=physicalReturnQuerySchema.safeParse(query);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Invalid physical return query.");
    return {ok:true,data:await this.returns.list(parsed.data)};
  }
  @Post() @HttpCode(200)
  async receive(@Req() req:AuthRequest,@Body() raw:unknown){
    this.requireAdmin(req);
    const parsed=physicalReturnReceiveSchema.safeParse(raw);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Invalid physical receipt evidence.",parsed.error.issues);
    return {ok:true,data:await this.returns.receive(req.actor.id,this.key(req),req.requestId,
      parsed.data as PhysicalReturnReceive)};
  }
  @Get(":returnId")
  async detail(@Req() req:AuthRequest,@Param("returnId") id:string){
    this.requireAdmin(req);
    return {ok:true,data:await this.returns.detail(id)};
  }
  @Post(":returnId/inspect") @HttpCode(200)
  async inspect(@Req() req:AuthRequest,@Param("returnId") id:string,@Body() raw:unknown){
    this.requireAdmin(req);
    const parsed=physicalReturnInspectSchema.safeParse(raw);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Invalid return inspection evidence.",parsed.error.issues);
    return {ok:true,data:await this.returns.inspect(req.actor.id,id,this.key(req),
      req.requestId,parsed.data as PhysicalReturnInspect)};
  }
}
