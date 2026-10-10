import { z } from "zod";
import { receiveRequestSchema, catalogProductSchema } from "./validation";

export const foundationCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  tint: z.string().optional(),
  count: z.number().int().nonnegative(),
  availableProducts: z.number().int().nonnegative(),
  isActive: z.literal(true),
});
export const foundationHomeSchema = z.object({
  categories: z.array(foundationCategorySchema),
  offers: z.array(catalogProductSchema),
  popular: z.array(catalogProductSchema),
  trendingNew: z.array(catalogProductSchema),
});
export const foundationProductDetailSchema = z.object({
  product: catalogProductSchema,
  related: z.array(catalogProductSchema),
  purchasable: z.boolean(),
});
export const foundationInventoryRowSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  productName: z.string(),
  variantName: z.string(),
  unit: z.string(),
  image: z.string(),
  sellablePhysical: z.string(),
  reserved: z.string(),
  safetyStock: z.string(),
  availableToSell: z.string(),
  isAvailable: z.boolean(),
  lotCount: z.number().int().nonnegative(),
});
export const foundationInventoryOverviewSchema = z.object({
  rows: z.array(foundationInventoryRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  locationId: z.string(),
});
export type FoundationInventoryOverview = z.infer<
  typeof foundationInventoryOverviewSchema
>;
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  category: z.string().max(128).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(12),
  sort: z
    .enum(["popular", "name", "price-asc", "price-desc"])
    .default("popular"),
});
export const byVariantsRequestSchema = z.strictObject({
  variantIds: z.array(z.string().min(1).max(128)).min(1).max(100),
});
export const stockReceiveRequestSchema = receiveRequestSchema
  .extend({
    lines: receiveRequestSchema.shape.lines.max(100),
    note: z.string().max(2000).optional(),
    poRef: z.string().max(128).optional(),
  })
  .superRefine((body, ctx) => {
    for (const [i, line] of body.lines.entries()) {
      if (Number(line.quantity) > 999999999999)
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "quantity"],
          message: "Quantity is too large",
        });
      if (
        line.unitCostMinor !== undefined &&
        (!Number.isSafeInteger(line.unitCostMinor) ||
          line.unitCostMinor > 2147483647)
      )
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "unitCostMinor"],
          message: "Cost is too large",
        });
      if (
        line.expiryDate &&
        (Number.isNaN(Date.parse(line.expiryDate)) ||
          new Date(line.expiryDate).toISOString().slice(0, 10) !==
            line.expiryDate)
      )
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "expiryDate"],
          message: "Invalid calendar date",
        });
      if (
        (line.lotNumber?.length ?? 0) > 128 ||
        (line.location?.length ?? 0) > 128
      )
        ctx.addIssue({
          code: "custom",
          path: ["lines", i],
          message: "Field is too long",
        });
    }
  });
