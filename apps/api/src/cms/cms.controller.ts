import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { cmsContentPageDraftRequestSchema, cmsHomepageDraftSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { CmsService } from "./cms.service";

@ApiExcludeController()
@Controller("content")
export class PublicCmsController {
  constructor(private readonly cms: CmsService) {}
  @Get("homepage") async homepage() { return { ok: true, data: await this.cms.publicHomepage() }; }
  @Get("pages/:slug") async page(@Param("slug") slug: string) { return { ok: true, data: await this.cms.publicPage(slug) }; }
}

@ApiExcludeController()
@Controller("admin/content")
@UseGuards(AccessGuard)
export class AdminCmsController {
  constructor(private readonly cms: CmsService) {}
  private requireAdmin(req: AuthRequest) { if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required."); }
  private parse<T>(schema: { safeParse(input: unknown): any }, input: unknown, message: string): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue: any) => ({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }

  @Get() async overview(@Req() req: AuthRequest) { this.requireAdmin(req); return { ok: true, data: await this.cms.overview() }; }
  @Get("homepage") async homepage(@Req() req: AuthRequest) { this.requireAdmin(req); return { ok: true, data: await this.cms.adminHomepage() }; }
  @Post("homepage/draft") @HttpCode(200)
  async saveHomepage(@Req() req: AuthRequest, @Body() body: unknown) {
    this.requireAdmin(req);
    const input = this.parse<ReturnType<typeof cmsHomepageDraftSchema.parse>>(cmsHomepageDraftSchema, body, "Homepage draft is invalid.");
    return { ok: true, data: await this.cms.saveHomepage(req.actor.id, req.requestId, input) };
  }
  @Post("homepage/publish") @HttpCode(200)
  async publishHomepage(@Req() req: AuthRequest) { this.requireAdmin(req); return { ok: true, data: await this.cms.publishHomepage(req.actor.id, req.requestId) }; }
  @Get("pages/:slug") async page(@Req() req: AuthRequest, @Param("slug") slug: string) { this.requireAdmin(req); return { ok: true, data: await this.cms.adminPage(slug) }; }
  @Post("pages/:slug/draft") @HttpCode(200)
  async savePage(@Req() req: AuthRequest, @Param("slug") slug: string, @Body() body: unknown) {
    this.requireAdmin(req);
    const input = this.parse<ReturnType<typeof cmsContentPageDraftRequestSchema.parse>>(cmsContentPageDraftRequestSchema, body, "Page draft is invalid.");
    return { ok: true, data: await this.cms.savePage(req.actor.id, req.requestId, slug, input) };
  }
  @Post("pages/:slug/publish") @HttpCode(200)
  async publishPage(@Req() req: AuthRequest, @Param("slug") slug: string) { this.requireAdmin(req); return { ok: true, data: await this.cms.publishPage(req.actor.id, req.requestId, slug) }; }
}
