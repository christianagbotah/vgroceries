import { Module } from "@nestjs/common";
import { AdminLogisticsNodesController } from "./admin-logistics-nodes.controller";
import { AdminLogisticsLanesController } from "./admin-logistics-lanes.controller";
import { LogisticsNodeService } from "./logistics-node.service";
import { LogisticsLaneService } from "./logistics-lane.service";

@Module({
  controllers: [AdminLogisticsNodesController, AdminLogisticsLanesController],
  providers: [LogisticsNodeService, LogisticsLaneService],
  exports: [LogisticsNodeService, LogisticsLaneService],
})
export class LogisticsModule {}
