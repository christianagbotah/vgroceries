import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CheckoutPickupPointsService } from "./checkout-pickup-points.service";

@ApiTags("checkout")
@Controller("checkout/zones")
export class CheckoutPickupPointsController {
  constructor(private readonly pickup: CheckoutPickupPointsService) {}

  @Get(":zoneId/pickup-points")
  async list(@Param("zoneId") zoneId: string, @Query("locality") locality?: string) {
    return { ok: true, data: await this.pickup.list(zoneId, locality) };
  }
}
