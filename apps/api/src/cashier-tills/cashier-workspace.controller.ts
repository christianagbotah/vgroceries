import { Controller, Get, Header, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { CashierWorkspaceService } from "./cashier-workspace.service";

@ApiTags("cashier-readonly")
@ApiCookieAuth()
@Controller("cashier/pos")
@UseGuards(AccessGuard)
export class CashierWorkspaceController {
  constructor(private readonly workspace: CashierWorkspaceService) {}

  @Get("workspace")
  @Header("Cache-Control", "private, no-store")
  async read(@Req() req: AuthRequest) {
    return { ok: true, data: await this.workspace.read(req) };
  }
}
