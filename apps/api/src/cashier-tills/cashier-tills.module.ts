import {Module} from "@nestjs/common";
import {CashierTillsController} from "./cashier-tills.controller";
import {CashierTillsService} from "./cashier-tills.service";
@Module({
  controllers:[CashierTillsController],
  providers:[CashierTillsService],
  exports:[CashierTillsService],
})
export class CashierTillsModule {}
