import { Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { HubtelSmsDispatchService } from "./hubtel-sms-dispatch.service";
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, HubtelSmsDispatchService],
  exports: [NotificationService, HubtelSmsDispatchService],
})
export class NotificationModule {}
