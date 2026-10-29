import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateCategoryRequest, CreateCategoryResponse } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

@Injectable()
export class CatalogAdminCategoryService {
  constructor(private readonly db: Database) {}

  async create(
    actorId: string,
    requestId: string,
    input: CreateCategoryRequest,
  ): Promise<CreateCategoryResponse> {
    try {
      return await this.db.$transaction(async (tx) => {
        const aggregate = await tx.category.aggregate({ _max: { sortOrder: true } });
        const category = await tx.category.create({
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description ?? "",
            active: input.isActive ?? true,
            sortOrder: (aggregate._max.sortOrder ?? 0) + 1,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: "catalog.category.created",
            entityId: category.id,
            requestId,
            details: { slug: category.slug, sortOrder: category.sortOrder },
          },
        });
        return { categoryId: category.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiProblem(409, "CATEGORY_SLUG_CONFLICT", "Category slug already exists.", { slug: input.slug });
      }
      throw error;
    }
  }
}
