import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Database } from "../database/database";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { ApiProblem } from "../http/errors";
import { API_CONFIG, type ApiConfig } from "../config";
import { businessProfileSchema, deliveryPartnerSchema, deliveryPartnerUpdateSchema, integrationIdSchema, parseCredentialDraft } from "./admin-configuration.schemas";
import { PublicBusinessController } from "./public-business.controller";
import { encryptCredentialDraft } from "./integration-vault";

const ok = <T>(data:T) => ({ok:true,data});
function requireAdmin(req:AuthRequest) {
  if(req.actor.role !== "admin") throw new ApiProblem(403,"FORBIDDEN","Administrator access required.");
}
function invalid(): never { throw new ApiProblem(400,"VALIDATION_FAILED","Configuration fields are invalid."); }
function conflict(): never { throw new ApiProblem(409,"CONFLICT","Configuration changed. Reload before saving."); }

@ApiExcludeController()
@Controller("admin")
@UseGuards(AccessGuard)
export class AdminConfigurationController {
  constructor(private readonly db:Database,@Inject(API_CONFIG) private readonly config:ApiConfig) {}
  @Get("settings/business")
  async business(@Req() req:AuthRequest) {
    requireAdmin(req);
    return ok({...await this.db.businessProfile.findUniqueOrThrow({where:{id:"main"}}),currency:"GHS"});
  }
  @Post("settings/business/update") @HttpCode(200)
  async updateBusiness(@Req() req:AuthRequest,@Body() body:unknown) {
    requireAdmin(req);
    const parsed=businessProfileSchema.safeParse(body); if(!parsed.success) return invalid();
    const {version,...fields}=parsed.data;
    return ok(await this.db.$transaction(async tx=>{
      const changed=await tx.businessProfile.updateMany({where:{id:"main",version},data:{...fields,version:{increment:1}}});
      if(changed.count!==1) return conflict();
      await tx.auditEvent.create({data:{actorId:req.actor.id,requestId:req.requestId,action:"business_profile.updated",entityId:"main",details:{version:version+1,fields:Object.keys(fields)}}});
      return {...await tx.businessProfile.findUniqueOrThrow({where:{id:"main"}}),currency:"GHS"};
    }));
  }
  @Get("delivery-providers")
  async partners(@Req() req:AuthRequest) {
    requireAdmin(req);
    return ok((await this.db.deliveryPartner.findMany({orderBy:[{name:"asc"},{id:"asc"}]})).map(p=>({...p,integrationMode:"manual",apiConnected:false})));
  }
  @Post("delivery-providers")
  async createPartner(@Req() req:AuthRequest,@Body() body:unknown) {
    requireAdmin(req);
    const parsed=deliveryPartnerSchema.safeParse(body); if(!parsed.success) return invalid();
    return ok(await this.db.$transaction(async tx=>{
      const p=await tx.deliveryPartner.create({data:parsed.data});
      await tx.auditEvent.create({data:{actorId:req.actor.id,requestId:req.requestId,action:"delivery_partner.created",entityId:p.id,details:{version:p.version,active:p.active}}});
      return {...p,integrationMode:"manual",apiConnected:false};
    }));
  }
  @Post("delivery-providers/:id/update") @HttpCode(200)
  async updatePartner(@Req() req:AuthRequest,@Param("id") id:string,@Body() body:unknown) {
    requireAdmin(req);
    const parsed=deliveryPartnerUpdateSchema.safeParse(body); if(!parsed.success) return invalid();
    const {version,...fields}=parsed.data;
    return ok(await this.db.$transaction(async tx=>{
      const changed=await tx.deliveryPartner.updateMany({where:{id,version},data:{...fields,version:{increment:1}}});
      if(changed.count!==1) return conflict();
      await tx.auditEvent.create({data:{actorId:req.actor.id,requestId:req.requestId,action:"delivery_partner.updated",entityId:id,details:{version:version+1,active:fields.active}}});
      return {...await tx.deliveryPartner.findUniqueOrThrow({where:{id}}),integrationMode:"manual",apiConnected:false};
    }));
  }
  @Get("integrations/credentials")
  async integrations(@Req() req:AuthRequest) {
    requireAdmin(req);
    const drafts=await this.db.integrationCredentialDraft.findMany({select:{id:true,version:true,updatedAt:true}});
    return ok({vaultReady:/^[0-9a-f]{64}$/i.test(process.env.ADMIN_INTEGRATION_VAULT_KEY??""),providers:integrationIdSchema.options.map(id=>({
      id,draft:drafts.find(d=>d.id===id)??null,
      runtimeConfigured:id==="hubtel-checkout"?Boolean(this.config.hubtelPayment?.onlineCheckout):id==="paystack-payment"?Boolean(this.config.paystack):Boolean(process.env.HUBTEL_SMS_CLIENT_ID&&process.env.HUBTEL_SMS_CLIENT_SECRET&&process.env.HUBTEL_SMS_SENDER_ID),
      activationSupported:false,
    }))});
  }
  @Post("integrations/credentials/:id/draft") @HttpCode(200)
  async saveDraft(@Req() req:AuthRequest,@Param("id") rawId:string,@Body() body:unknown) {
    requireAdmin(req);
    const idResult=integrationIdSchema.safeParse(rawId); if(!idResult.success) return invalid();
    const id=idResult.data;
    const draft=parseCredentialDraft(id,body); if(!draft) return invalid();
    const key=process.env.ADMIN_INTEGRATION_VAULT_KEY??"";
    if(!/^[0-9a-f]{64}$/i.test(key)) throw new ApiProblem(503,"UNAVAILABLE","Credential vault is not provisioned.");
    const next=draft.version+1;
    const ciphertext=encryptCredentialDraft(id,next,draft.credentials,key);
    return ok(await this.db.$transaction(async tx=>{
      // Serialize even first-write races. No provider calls or runtime changes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"credential-draft:"+id},0))`;
      const prior=await tx.integrationCredentialDraft.findUnique({where:{id},select:{version:true}});
      if((prior?.version??0)!==draft.version) return conflict();
      const stored=await tx.integrationCredentialDraft.upsert({where:{id},create:{id,ciphertext,version:next},update:{ciphertext,version:next},select:{id:true,version:true,updatedAt:true}});
      await tx.auditEvent.create({data:{actorId:req.actor.id,requestId:req.requestId,action:"integration_credentials.draft_saved",entityId:id,details:{version:next}}});
      return {...stored,activationSupported:false};
    }));
  }
}
@Module({controllers:[AdminConfigurationController,PublicBusinessController]})
export class AdminConfigurationModule {}
