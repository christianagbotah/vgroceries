import { z } from "zod";

export const createCategoryRequestSchema = z.strictObject({
  name: z.string().trim().min(1, "Category name is required.").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Category slug is required.")
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Category slug may contain lowercase letters, numbers and single hyphens only."),
  description: z.string().trim().max(2_000).optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export interface CreateCategoryResponse {
  categoryId: string;
}
