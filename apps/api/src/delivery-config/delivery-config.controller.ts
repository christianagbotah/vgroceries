import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DeliveryConfigService } from "./delivery-config.service";

@ApiTags("checkout")
@Controller("checkout")
export class DeliveryConfigController {
  constructor(private readonly delivery: DeliveryConfigService) {}
  @Get("zones") async zones() { return { ok: true, data: await this.delivery.listZones() }; }
  @Get("zones/:zoneId/slots") async slots(@Param("zoneId") zoneId: string) {
    return { ok: true, data: await this.delivery.listSlots(zoneId) };
  }
}
