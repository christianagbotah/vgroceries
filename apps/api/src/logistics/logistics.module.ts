import { Module } from "@nestjs/common";
import { AdminLogisticsNodesController } from "./admin-logistics-nodes.controller";
import { AdminLogisticsLanesController } from "./admin-logistics-lanes.controller";
import { AdminLogisticsWorkflowsController } from "./admin-logistics-workflows.controller";
import { AdminLogisticsRouteRulesController } from "./admin-logistics-route-rules.controller";
import { LogisticsNodeService } from "./logistics-node.service";
import { LogisticsLaneService } from "./logistics-lane.service";
import { LogisticsWorkflowService } from "./logistics-workflow.service";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";
import { LogisticsBootstrapService } from "./logistics-bootstrap.service";
@Module({
  controllers:[AdminLogisticsNodesController,AdminLogisticsLanesController,AdminLogisticsWorkflowsController,AdminLogisticsRouteRulesController],
  providers:[LogisticsNodeService,LogisticsLaneService,LogisticsWorkflowService,LogisticsRouteRuleService,LogisticsBootstrapService],
  exports:[LogisticsNodeService,LogisticsLaneService,LogisticsWorkflowService,LogisticsRouteRuleService,LogisticsBootstrapService],
})
export class LogisticsModule {}
