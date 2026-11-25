import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Database } from "../database/database";
import { publicBusinessContactSchema, publicBusinessIdentitySchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";

@ApiExcludeController()
@Controller("content")
export class PublicBusinessController {
  constructor(private readonly db: Database) {}
  @Get("business-identity")
  async identity() {
    const identity=await this.db.businessProfile.findUnique({
      where:{id:"main"}, select:{businessName:true},
    });
    const parsed=publicBusinessIdentitySchema.safeParse(identity);
    if(!parsed.success)throw new ApiProblem(503,"UNAVAILABLE","Business identity unavailable.");
    return {ok:true,data:parsed.data};
  }
  @Get("business-contact")
  async contact() {
    const contact=await this.db.businessProfile.findUnique({
      where:{id:"main"},
      select:{supportPhone:true,supportEmail:true,address:true,operatingHours:true,receiptFooter:true},
    });
    const parsed=publicBusinessContactSchema.safeParse(contact);
    if(!parsed.success)throw new ApiProblem(503,"UNAVAILABLE","Business contact information unavailable.");
    return {ok:true,data:parsed.data};
  }
}
