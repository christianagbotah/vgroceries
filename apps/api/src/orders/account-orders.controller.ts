import { Body,Controller,Get,HttpCode,Param,Post,Query,Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { accountCancelPathRequestSchema,accountOrdersQuerySchema } from "@variety/contracts";
import { ApiProblem,ApiRequest } from "../http/errors";
import { IdentityService } from "../identity/identity.service";
import { OrderCancellationService } from "./order-cancellation.service";
import { OrderQueryService } from "./order-query.service";
@ApiTags("account") @Controller("account/orders")
export class AccountOrdersController {constructor(private readonly identity:IdentityService,private readonly orders:OrderQueryService,private readonly cancellation:OrderCancellationService){}
 private async customer(req:ApiRequest){const auth=await this.identity.authenticate(req);if(auth.actor.role!=="customer")throw new ApiProblem(403,"FORBIDDEN","Customer account access required.");return auth;}
 @Get() async list(@Req() req:ApiRequest,@Query() query:Record<string,unknown>){const auth=await this.customer(req);const parsed=accountOrdersQuerySchema.safeParse(query);if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid account order query.");if(parsed.data.customerId&&parsed.data.customerId!==auth.actor.id)throw new ApiProblem(403,"FORBIDDEN","Customer ownership mismatch.");return{ok:true,data:await this.orders.listCustomer(auth.actor.id,parsed.data.page,parsed.data.perPage)};}
 @Post(":orderId/cancel") @HttpCode(200) async cancel(@Param("orderId") orderId:string,@Body() body:unknown,@Req() req:ApiRequest){const auth=await this.customer(req);const parsed=accountCancelPathRequestSchema.safeParse(body);if(!parsed.success||parsed.data.orderId&&parsed.data.orderId!==orderId)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid cancellation request.");return{ok:true,data:await this.cancellation.cancel(auth.actor.id,req.requestId,orderId,parsed.data.reason)};}
}
