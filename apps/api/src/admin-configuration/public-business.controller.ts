import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Database } from "../database/database";
import { publicBusinessContactSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";

@ApiExcludeController()
@Controller("content/business-contact")
export class PublicBusinessController {
  constructor(private readonly db: Database) {}
  @Get()
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
