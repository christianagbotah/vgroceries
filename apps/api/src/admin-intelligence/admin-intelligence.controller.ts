import { Body, Controller, Get, HttpCode, Module, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { AdminIntelligenceService } from "./admin-intelligence.service";
import { CatalogModule } from "../catalog/catalog.controller";

const reviewSchema = z.strictObject({ suggestionId: z.string().min(1).max(128), decision: z.enum(["reviewed", "dismissed"]) });
const questionSchema = z.strictObject({ question: z.string().trim().min(2).max(1000) });

@ApiTags("admin-intelligence")
@Controller("admin")
@UseGuards(AccessGuard)
export class AdminIntelligenceController {
  constructor(private readonly intelligence: AdminIntelligenceService) {}
  private admin(req: AuthRequest) {
    if (req.actor.role !== "admin") throw new ApiProblem(403, "FORBIDDEN", "Administrator access required.");
  }

  @Get("dashboard")
  async dashboard(@Req() req: AuthRequest) {
    this.admin(req);
    return { ok: true, data: await this.intelligence.dashboard() };
  }

  @Get("ai/suggestions")
  async suggestions(@Req() req: AuthRequest) {
    this.admin(req);
    return { ok: true, data: await this.intelligence.suggestions() };
  }

  @Post("ai/generate") @HttpCode(200)
  async generate(@Req() req: AuthRequest) {
    this.admin(req);
    return { ok: true, data: await this.intelligence.generate(req.actor.id, req.requestId) };
  }

  @Post("ai/review") @HttpCode(200)
  async review(@Req() req: AuthRequest, @Body() body: unknown) {
    this.admin(req);
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid AI suggestion review.");
    return { ok: true, data: await this.intelligence.review(req.actor.id, req.requestId, parsed.data.suggestionId, parsed.data.decision) };
  }

  @Post("ai/business-question") @HttpCode(200)
  async businessQuestion(@Req() req: AuthRequest, @Body() body: unknown) {
    this.admin(req);
    const parsed = questionSchema.safeParse(body);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Enter a business question between 2 and 1000 characters.");
    return { ok: true, data: await this.intelligence.businessQuestion(parsed.data.question) };
  }
}

@Module({
  imports: [CatalogModule],
  controllers: [AdminIntelligenceController],
  providers: [AdminIntelligenceService],
})
export class AdminIntelligenceModule {}
