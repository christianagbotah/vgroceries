import {Module} from "@nestjs/common";
import {
  CustomerReturnClaimsController,AdminReturnClaimsController,
} from "./customer-return-claims.controller";
import {CustomerReturnClaimsService} from "./customer-return-claims.service";

@Module({
  controllers:[CustomerReturnClaimsController,AdminReturnClaimsController],
  providers:[CustomerReturnClaimsService],
  exports:[CustomerReturnClaimsService],
})
export class CustomerReturnClaimsModule {}
