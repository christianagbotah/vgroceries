import { Body, Controller, Module, Post } from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { ghanaMealPlanRequestSchema } from "@variety/contracts";
import { CatalogModule } from "../catalog/catalog.controller";
import { ApiProblem } from "../http/errors";
import { GhanaMealAssistantService } from "./ghana-meal-assistant.service";
import { GhanaModelInterpreter } from "./ghana-model-interpreter";

@ApiTags("ai")
@Controller("ai")
export class GhanaMealAssistantController {
  constructor(private readonly assistant: GhanaMealAssistantService) {}

  @Post("meal-plan")
  @ApiBody({
    schema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 2, maxLength: 1000 },
        language: { type: "string", enum: ["auto", "english", "twi", "ga", "ewe"], default: "auto" },
        servings: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  })
  async mealPlan(@Body() body: unknown) {
    const parsed = ghanaMealPlanRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Tell us the meal or ingredients you want and, optionally, the number of people.");
    return { ok: true, data: await this.assistant.plan(parsed.data) };
  }
}

@Module({
  imports: [CatalogModule],
  controllers: [GhanaMealAssistantController],
  providers: [GhanaMealAssistantService, GhanaModelInterpreter],
})
export class GhanaMealAssistantModule {}
