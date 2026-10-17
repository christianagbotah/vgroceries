import { Module } from "@nestjs/common";
import { AdminLogisticsNodesController } from "./admin-logistics-nodes.controller";
import { AdminLogisticsLanesController } from "./admin-logistics-lanes.controller";
import { AdminLogisticsWorkflowsController } from "./admin-logistics-workflows.controller";
import { LogisticsNodeService } from "./logistics-node.service";
import { LogisticsLaneService } from "./logistics-lane.service";
import { LogisticsWorkflowService } from "./logistics-workflow.service";

@Module({
  controllers: [AdminLogisticsNodesController, AdminLogisticsLanesController, AdminLogisticsWorkflowsController],
  providers: [LogisticsNodeService, LogisticsLaneService, LogisticsWorkflowService],
  exports: [LogisticsNodeService, LogisticsLaneService, LogisticsWorkflowService],
})
export class LogisticsModule {}
