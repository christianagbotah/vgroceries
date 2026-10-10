import { Controller,Get,Query,Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { accountOrdersQuerySchema } from "@variety/contracts";
import { ApiProblem,ApiRequest } from "../http/errors";
import { IdentityService } from "../identity/identity.service";
import { OrderQueryService } from "./order-query.service";
@ApiTags("account") @Controller("account/orders")
export class AccountOrdersController {constructor(private readonly identity:IdentityService,private readonly orders:OrderQueryService){}
 @Get() async list(@Req() req:ApiRequest,@Query() query:Record<string,unknown>){const auth=await this.identity.authenticate(req);if(auth.actor.role!=="customer")throw new ApiProblem(403,"FORBIDDEN","Customer account access required.");const parsed=accountOrdersQuerySchema.safeParse(query);if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid account order query.");if(parsed.data.customerId&&parsed.data.customerId!==auth.actor.id)throw new ApiProblem(403,"FORBIDDEN","Customer ownership mismatch.");return{ok:true,data:await this.orders.listCustomer(auth.actor.id,parsed.data.page,parsed.data.perPage)};}
}
