import { Controller, Get, Header, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { PosCustomersService } from "./pos-customers.service";

@ApiTags("pos-customers")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("admin/pos/customers")
export class PosCustomersController {
  constructor(private readonly customers: PosCustomersService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async search(@Req() req: AuthRequest, @Query("q") query: unknown) {
    return { ok: true, data: await this.customers.search(req, query) };
  }
}
