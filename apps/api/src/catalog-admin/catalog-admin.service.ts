import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateProductDraftRequest } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

@Injectable()
export class CatalogAdminService {
  constructor(private readonly db: Database) {}

  async createDraft(
    actorId: string,
    requestId: string,
    input: CreateProductDraftRequest,
  ): Promise<{ productId: string; editorPath: string }> {
    const category = await this.db.category.findUnique({ where: { id: input.categoryId } });
    if (!category?.active)
      throw new ApiProblem(404, "CATEGORY_NOT_FOUND", "Active category not found.");

    try {
      return await this.db.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: input.name,
            slug: input.slug,
            categoryId: input.categoryId,
            shortDescription: input.shortDescription ?? "",
            description: input.description ?? "",
            tags: input.tags ?? [],
            image: "",
            published: false,
            brandMode: "auto",
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: "catalog.product.draft.created",
            entityId: product.id,
            requestId,
            details: { slug: product.slug, categoryId: product.categoryId },
          },
        });
        return { productId: product.id, editorPath: `/admin/products/${product.id}` };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ApiProblem(409, "PRODUCT_SLUG_CONFLICT", "A product already uses that slug.");
      throw error;
    }
  }
}
