import { CustomerOtpController } from "./customer-otp.controller";
import { Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
@Module({ controllers: [NotificationController, CustomerOtpController], providers: [NotificationService], exports: [NotificationService] })
export class NotificationModule {}
