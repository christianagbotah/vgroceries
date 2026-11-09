import {Module} from "@nestjs/common";
import {CashierTillsController} from "./cashier-tills.controller";
import {PosQuoteController} from "./pos-quote.controller";
import {PosQuoteService} from "./pos-quote.service";
import {OrdersModule} from "../orders/orders.module";
import {CashierTillsService} from "./cashier-tills.service";
@Module({
  imports:[OrdersModule],
  controllers:[CashierTillsController,PosQuoteController],
  providers:[CashierTillsService,PosQuoteService],
  exports:[CashierTillsService],
})
export class CashierTillsModule {}
