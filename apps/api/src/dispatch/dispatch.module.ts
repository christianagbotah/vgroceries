import { Module } from "@nestjs/common";
import { AdminDispatchController } from "./admin-dispatch.controller";
import { AdminRidersController } from "./admin-riders.controller";
import { RiderController } from "./rider.controller";
import { DispatchCommandService } from "./dispatch-command.service";
import { DispatchEventService } from "./dispatch-event.service";
import { DispatchPolicyService } from "./dispatch-policy.service";
import { DispatchQueryService } from "./dispatch-query.service";
import { ManualProviderService } from "./manual-provider.service";
import { RiderCommandService } from "./rider-command.service";

@Module({
  controllers:[AdminDispatchController,AdminRidersController,RiderController],
  providers:[DispatchPolicyService,DispatchEventService,ManualProviderService,DispatchCommandService,DispatchQueryService,RiderCommandService],
  exports:[DispatchPolicyService,DispatchCommandService,DispatchQueryService,RiderCommandService],
})
export class DispatchModule {}
