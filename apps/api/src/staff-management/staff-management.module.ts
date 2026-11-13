import { Module } from "@nestjs/common";
import { StaffManagementController } from "./staff-management.controller";
import { StaffManagementService } from "./staff-management.service";
import { CashierInvitationsController } from "./cashier-invitations.controller";
import { CashierInvitationsService } from "./cashier-invitations.service";

@Module({
  controllers: [StaffManagementController, CashierInvitationsController],
  providers: [StaffManagementService, CashierInvitationsService],
})
export class StaffManagementModule {}
