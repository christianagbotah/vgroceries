import { Module } from "@nestjs/common";
import { AdminLogisticsNodesController } from "./admin-logistics-nodes.controller";
import { LogisticsNodeService } from "./logistics-node.service";

@Module({
  controllers: [AdminLogisticsNodesController],
  providers: [LogisticsNodeService],
  exports: [LogisticsNodeService],
})
export class LogisticsModule {}
