import { Module } from "@nestjs/common";
import { PhysicalReturnsController } from "./physical-returns.controller";
import { PhysicalReturnsService } from "./physical-returns.service";

@Module({
  controllers:[PhysicalReturnsController],
  providers:[PhysicalReturnsService],
  exports:[PhysicalReturnsService],
})
export class PhysicalReturnsModule {}
