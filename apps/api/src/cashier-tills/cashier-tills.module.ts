import { CashierWorkspaceController } from "./cashier-workspace.controller";
import { PosCustomersController } from "./pos-customers.controller";
import { PosCustomersService } from "./pos-customers.service";
import { CashierWorkspaceService } from "./cashier-workspace.service";
import {Module} from "@nestjs/common";
import {CashierTillsController} from "./cashier-tills.controller";
import {PosQuoteController} from "./pos-quote.controller";
import {PosQuoteService} from "./pos-quote.service";
import {OrdersModule} from "../orders/orders.module";
import {InventoryModule} from "../inventory/inventory.controller";
import {PosHoldsController} from "./pos-holds.controller";
import {PosHoldsService} from "./pos-holds.service";
import {CashierTillsService} from "./cashier-tills.service";
import {PosTillReconciliationService} from "./pos-till-reconciliation.service";
import {PosCashSalesService} from "./pos-cash-sales.service";
import {PosCashSalesController} from "./pos-cash-sales.controller";
@Module({
  imports:[OrdersModule,InventoryModule],
  controllers:[
    CashierTillsController,PosQuoteController,PosHoldsController,
    PosCashSalesController,CashierWorkspaceController,PosCustomersController,
  ],
  providers:[
    CashierTillsService,PosQuoteService,PosHoldsService,PosCashSalesService,
    PosTillReconciliationService,CashierWorkspaceService,PosCustomersService,
  ],
  exports:[CashierTillsService],
})
export class CashierTillsModule {}
