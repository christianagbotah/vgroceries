import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { createCategoryRequestSchema } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard, Permission } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { CatalogAdminCategoryService } from "./catalog-admin-category.service";

@Controller("admin/categories")
@UseGuards(AccessGuard)
export class CatalogAdminCategoryController {
  constructor(private readonly categories: CatalogAdminCategoryService) {}

  @Post()
  @Permission("catalog.category.create")
  async create(@Req() req: AuthRequest, @Body() body: unknown) {
    const parsed = createCategoryRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid category.", {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    return {
      ok: true,
      data: await this.categories.create(req.actor.id, req.requestId, parsed.data),
    };
  }
}
