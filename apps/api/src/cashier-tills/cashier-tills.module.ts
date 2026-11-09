import {Module} from "@nestjs/common";
import {CashierTillsController} from "./cashier-tills.controller";
import {PosQuoteController} from "./pos-quote.controller";
import {PosQuoteService} from "./pos-quote.service";
import {OrdersModule} from "../orders/orders.module";
import {InventoryModule} from "../inventory/inventory.controller";
import {PosHoldsController} from "./pos-holds.controller";
import {PosHoldsService} from "./pos-holds.service";
import {CashierTillsService} from "./cashier-tills.service";
import {PosCashSalesService} from "./pos-cash-sales.service";
import {PosCashSalesController} from "./pos-cash-sales.controller";
@Module({
  imports:[OrdersModule,InventoryModule],
  controllers:[
    CashierTillsController,PosQuoteController,PosHoldsController,
    PosCashSalesController,
  ],
  providers:[CashierTillsService,PosQuoteService,PosHoldsService,PosCashSalesService],
  exports:[CashierTillsService],
})
export class CashierTillsModule {}
