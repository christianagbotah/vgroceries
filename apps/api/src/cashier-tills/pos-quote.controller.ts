import {Body,Controller,HttpCode,Post,Req,UseGuards} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {posQuoteRequestSchema} from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem} from "../http/errors";
import {PosQuoteService} from "./pos-quote.service";

@ApiTags("pos-quote")
@ApiCookieAuth()
@Controller("admin/pos")
@UseGuards(AccessGuard)
export class PosQuoteController {
  constructor(private readonly quotes:PosQuoteService){}

  @Post("quote") @HttpCode(200)
  async preview(@Req() req:AuthRequest,@Body() raw:unknown){
    if(req.actor.role!=="admin")
      throw new ApiProblem(403,"FORBIDDEN",
        "Only administrators may preview counter sales at this stage.");
    const parsed=posQuoteRequestSchema.safeParse(raw);
    if(!parsed.success)
      throw new ApiProblem(400,"VALIDATION_FAILED",
        "An open till and valid item quantities are required.",parsed.error.issues);
    return {ok:true,data:await this.quotes.quote(parsed.data)};
  }
}
