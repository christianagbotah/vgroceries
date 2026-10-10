import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import {
  byVariantsRequestSchema,
  catalogQuerySchema,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get("categories") async categories() {
    return { ok: true, data: await this.catalog.categories() };
  }
  @Get("home") async home() {
    return { ok: true, data: await this.catalog.home() };
  }
  @Get("products") async list(@Query() query: unknown) {
    const parsed = catalogQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new ApiProblem(
        400,
        "VALIDATION_FAILED",
        "Invalid catalogue query.",
      );
    return { ok: true, data: await this.catalog.list(parsed.data) };
  }
  @Post("products\\:by-variants")
  @ApiBody({
    schema: {
      type: "object",
      required: ["variantIds"],
      properties: {
        variantIds: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { type: "string" },
        },
      },
      additionalProperties: false,
    },
  })
  async byVariants(@Body() body: unknown) {
    const parsed = byVariantsRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiProblem(
        400,
        "VALIDATION_FAILED",
        "Invalid variant selection.",
      );
    return {
      ok: true,
      data: await this.catalog.byVariants(parsed.data.variantIds),
    };
  }
  @Get("products/:slug") async detail(@Param("slug") slug: string) {
    if (slug.length > 128)
      throw new ApiProblem(400, "VALIDATION_FAILED", "Invalid product slug.");
    return { ok: true, data: await this.catalog.detail(slug) };
  }
}
@Module({ controllers: [CatalogController], providers: [CatalogService] })
export class CatalogModule {}
