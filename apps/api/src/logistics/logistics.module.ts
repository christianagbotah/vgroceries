import { Module } from "@nestjs/common";
import { AdminLogisticsNodesController } from "./admin-logistics-nodes.controller";
import { AdminLogisticsLanesController } from "./admin-logistics-lanes.controller";
import { AdminLogisticsWorkflowsController } from "./admin-logistics-workflows.controller";
import { AdminLogisticsRouteRulesController } from "./admin-logistics-route-rules.controller";
import { AdminLogisticsShipmentsController } from "./admin-logistics-shipments.controller";
import { LogisticsNodeService } from "./logistics-node.service";
import { LogisticsLaneService } from "./logistics-lane.service";
import { LogisticsWorkflowService } from "./logistics-workflow.service";
import { LogisticsRouteRuleService } from "./logistics-route-rule.service";
import { LogisticsBootstrapService } from "./logistics-bootstrap.service";
import { ShipmentPlanningService } from "./shipment-planning.service";
import { ShipmentExecutionService } from "./shipment-execution.service";
import { ShipmentFinalMileService } from "./shipment-final-mile.service";
import { ShipmentQueryService } from "./shipment-query.service";
@Module({
  controllers:[AdminLogisticsNodesController,AdminLogisticsLanesController,AdminLogisticsWorkflowsController,AdminLogisticsRouteRulesController,AdminLogisticsShipmentsController],
  providers:[LogisticsNodeService,LogisticsLaneService,LogisticsWorkflowService,LogisticsRouteRuleService,LogisticsBootstrapService,ShipmentPlanningService,ShipmentExecutionService,ShipmentFinalMileService,ShipmentQueryService],
  exports:[LogisticsNodeService,LogisticsLaneService,LogisticsWorkflowService,LogisticsRouteRuleService,LogisticsBootstrapService,ShipmentPlanningService,ShipmentExecutionService,ShipmentFinalMileService,ShipmentQueryService],
})
export class LogisticsModule {}
