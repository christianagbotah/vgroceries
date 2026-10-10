import { Module } from "@nestjs/common";
import { DeliveryConfigController } from "./delivery-config.controller";
import { DeliveryConfigService } from "./delivery-config.service";
@Module({ controllers: [DeliveryConfigController], providers: [DeliveryConfigService], exports: [DeliveryConfigService] })
export class DeliveryConfigModule {}
