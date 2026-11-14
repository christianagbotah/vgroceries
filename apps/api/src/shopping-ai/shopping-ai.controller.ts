import { Body, Controller, Inject, Module, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CatalogModule } from "../catalog/catalog.controller";
import { ApiProblem } from "../http/errors";
import { ShoppingAiService } from "./shopping-ai.service";

/** One-process fallback; production scale-out additionally requires a shared edge rate limit. */
class PublicAiLimiter {
  private static readonly requests=new Map<string,{until:number,count:number}>();
  static check(ip:string) {
    const now=Date.now(), key=ip||"unknown", old=this.requests.get(key);
    if(this.requests.size>3000){
      for(const [k,v] of this.requests)if(v.until<=now)this.requests.delete(k);
      if(this.requests.size>3000)this.requests.clear();
    }
    const entry=!old||old.until<=now?{until:now+60000,count:1}:{until:old.until,count:old.count+1};
    this.requests.set(key,entry);
    if(entry.count>20)throw new ApiProblem(429,"RATE_LIMITED","Too many assistant questions. Try again shortly.");
  }
}
@ApiTags("shopping-ai")
@Controller("ai")
export class ShoppingAiController {
  constructor(private readonly service:ShoppingAiService) {}
  @Post("assistant")
  @ApiOperation({summary:"Ask stock-verified grocery questions; no private order access"})
  @ApiBody({schema:{type:"object",required:["question"],additionalProperties:false,properties:{question:{type:"string",minLength:1,maxLength:400}}}})
  async assistant(@Req() request:Request,@Body() raw:unknown){
    PublicAiLimiter.check(request.ip??"unknown");
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||typeof (raw as {question?:unknown}).question!=="string"
      ||Object.keys(raw).some(k=>k!=="question"))
      throw new ApiProblem(400,"VALIDATION_FAILED","Supply a question as text.");
    return {ok:true,data:await this.service.answer((raw as {question:string}).question)};
  }
  @Post("budget-basket")
  @ApiOperation({summary:"Suggest available grocery items within an amount in pesewas"})
  @ApiBody({schema:{type:"object",required:["budgetMinor"],additionalProperties:false,properties:{budgetMinor:{type:"integer",minimum:100,maximum:200000000}}}})
  async budget(@Req() request:Request,@Body() raw:unknown){
    PublicAiLimiter.check(request.ip??"unknown");
    if(!raw||typeof raw!=="object"||Array.isArray(raw)
      ||!Number.isSafeInteger((raw as {budgetMinor?:unknown}).budgetMinor)
      ||Object.keys(raw).some(k=>k!=="budgetMinor"))
      throw new ApiProblem(400,"VALIDATION_FAILED","Supply a valid budget in pesewas.");
    return {ok:true,data:await this.service.basket((raw as {budgetMinor:number}).budgetMinor)};
  }
}
@Module({
  imports:[CatalogModule],
  controllers:[ShoppingAiController],
  providers:[ShoppingAiService],
})
export class ShoppingAiModule {}
