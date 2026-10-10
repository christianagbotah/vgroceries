import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { checkoutQuoteRequestSchema, checkoutCompleteRestRequestSchema, replayKeySchema, type CompleteOrderRequest } from "@variety/contracts";
import { CheckoutPrincipalService } from "../commerce-identity/checkout-principal.service";
import { GuestCheckoutService } from "../commerce-identity/guest-checkout.service";
import { ApiProblem, ApiRequest } from "../http/errors";
import { CheckoutQuoteService } from "./checkout-quote.service";
import { CheckoutCommandService } from "./checkout-command.service";

@ApiTags("checkout")
@Controller("checkout")
export class CheckoutController {
  constructor(private readonly quoteService: CheckoutQuoteService, private readonly command: CheckoutCommandService, private readonly principals: CheckoutPrincipalService, private readonly guests: GuestCheckoutService) {}
  @Post("quote") @HttpCode(200)
  async quote(@Body() body: unknown,@Req() req: ApiRequest,@Res({passthrough:true}) res: Response) {
    const parsed=checkoutQuoteRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiProblem(400,"VALIDATION_FAILED","Invalid checkout quote request.",{issues:parsed.error.issues.map(i=>`${i.path.join(".")||"(root)"}: ${i.message}`)});
    if (!req.get("authorization") && !(req.get("cookie")??"").includes("vg_session=")) await this.guests.ensure(req,res);
    return {ok:true,data:await this.quoteService.quote(parsed.data)};
  }
  @Post("complete") @HttpCode(201)
  async complete(@Body() body: unknown,@Req() req: ApiRequest,@Res({passthrough:true}) res: Response) {
    const parsed=checkoutCompleteRestRequestSchema.safeParse(body);
    if(!parsed.success) throw new ApiProblem(400,"VALIDATION_FAILED","Invalid checkout request.",{issues:parsed.error.issues.map(i=>`${i.path.join(".")||"(root)"}: ${i.message}`)});
    const header=req.get("idempotency-key"); const bodyKey=parsed.data.idempotencyKey;
    if(header&&bodyKey&&header!==bodyKey) throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Header and body idempotency keys do not match.");
    const checked=replayKeySchema.safeParse(header??bodyKey); if(!checked.success) throw new ApiProblem(400,"VALIDATION_FAILED","A valid Idempotency-Key is required.");
    const principal=await this.principals.forMutation(req,res);
    const input={...parsed.data,idempotencyKey:checked.data} as CompleteOrderRequest;
    return {ok:true,data:await this.command.complete(req,principal,input,checked.data)};
  }
}
