import { Body,Controller,Get,HttpCode,Param,Post,Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { trackRequestSchema } from "@variety/contracts";
import { ApiProblem,ApiRequest } from "../http/errors";
import { CheckoutPrincipalService } from "./checkout-principal.service";
import { OrderQueryService } from "./order-query.service";
@ApiTags("orders") @Controller("orders")
export class OrdersController {constructor(private readonly principals:CheckoutPrincipalService,private readonly orders:OrderQueryService){}
 @Get(":orderId") async status(@Param("orderId") id:string,@Req() req:ApiRequest){const p=await this.principals.forRead(req);return{ok:true,data:await this.orders.status(p,id)};}
 @Post("track") @HttpCode(200) async track(@Body() body:unknown,@Req() req:ApiRequest){const p=trackRequestSchema.safeParse(body);if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid tracking request.");const clientKey=req.ip||req.socket.remoteAddress||"unknown";return{ok:true,data:await this.orders.track(p.data.reference,p.data.code,clientKey,req.requestId)};}
}
