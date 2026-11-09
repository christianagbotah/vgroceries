import { Module } from "@nestjs/common";
import { CommerceIdentityModule } from "../commerce-identity/commerce-identity.module";
import { IdentityModule } from "../identity/identity.module";
import { PickupAppointmentService } from "./pickup-appointment.service";
import { CustomerPickupAppointmentController,AdminPickupAppointmentPolicyController,
  AdminPickupCentreClosuresController } from "./pickup-appointment.controller";
import { CheckoutPickupPointsController } from "./checkout-pickup-points.controller";
import { CheckoutPickupPointsService } from "./checkout-pickup-points.service";
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
import { ShipmentCollectionService } from "./shipment-collection.service";
import { VerificationCodeService } from "../orders/verification-code.service";
import { ShipmentExecutionService } from "./shipment-execution.service";
import { ShipmentFinalMileService } from "./shipment-final-mile.service";
import { ShipmentQueryService } from "./shipment-query.service";
import { ShipmentCustomerTrackingService } from "./shipment-customer-tracking.service";
@Module({
  imports:[CommerceIdentityModule,IdentityModule],
  controllers:[CustomerPickupAppointmentController,AdminPickupAppointmentPolicyController,AdminPickupCentreClosuresController,CheckoutPickupPointsController,AdminLogisticsNodesController,AdminLogisticsLanesController,AdminLogisticsWorkflowsController,AdminLogisticsRouteRulesController,AdminLogisticsShipmentsController],
  providers:[PickupAppointmentService,VerificationCodeService,ShipmentCollectionService,CheckoutPickupPointsService,LogisticsNodeService,LogisticsLaneService,LogisticsWorkflowService,LogisticsRouteRuleService,LogisticsBootstrapService,ShipmentPlanningService,ShipmentExecutionService,ShipmentFinalMileService,ShipmentQueryService,ShipmentCustomerTrackingService],
  exports:[PickupAppointmentService,CheckoutPickupPointsService,LogisticsNodeService,LogisticsLaneService,LogisticsWorkflowService,LogisticsRouteRuleService,LogisticsBootstrapService,ShipmentPlanningService,ShipmentExecutionService,ShipmentFinalMileService,ShipmentQueryService,ShipmentCustomerTrackingService],
})
export class LogisticsModule {}
