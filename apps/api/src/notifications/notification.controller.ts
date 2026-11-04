import { Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ApiProblem, ApiRequest } from "../http/errors";
import { IdentityService } from "../identity/identity.service";
import { NotificationService } from "./notification.service";

@ApiExcludeController()
@Controller("account/notifications")
export class NotificationController {
  constructor(private readonly identity: IdentityService, private readonly inbox: NotificationService) {}
  private async customer(req: ApiRequest) {
    const auth = await this.identity.authenticate(req);
    if (auth.actor.role !== "customer") throw new ApiProblem(403, "FORBIDDEN", "Customer account access required.");
    return auth.actor.id;
  }
  @Get()
  async list(@Req() req: ApiRequest, @Query("limit") rawLimit?: string) {
    const userId = await this.customer(req);
    if (rawLimit !== undefined && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit))
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid notification limit.");
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    return { ok: true, data: await this.inbox.list(userId, limit) };
  }
  @Post(":notificationId/read")
  @HttpCode(200)
  async markRead(@Req() req: ApiRequest, @Param("notificationId") id: string) {
    const userId = await this.customer(req);
    return { ok: true, data: await this.inbox.markRead(userId, id, req.requestId) };
  }
}
