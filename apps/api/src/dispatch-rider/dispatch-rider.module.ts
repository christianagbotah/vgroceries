import { Module } from "@nestjs/common";
import { DispatchController, RiderController } from "./dispatch-rider.controller";
import { DispatchRiderService } from "./dispatch-rider.service";

@Module({
  controllers: [DispatchController, RiderController],
  providers: [DispatchRiderService],
})
export class DispatchRiderModule {}
