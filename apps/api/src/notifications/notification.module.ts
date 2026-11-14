import { Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { SmsDispatchService } from "./sms-dispatch.service";
@Module({ controllers: [NotificationController], providers: [NotificationService, SmsDispatchService], exports: [NotificationService, SmsDispatchService] })
export class NotificationModule {}
