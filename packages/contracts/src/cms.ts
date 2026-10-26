import { z } from "zod";

export const cmsContentPageSlugSchema = z.enum(["help", "returns-policy", "privacy", "terms"]);
export type CmsContentPageSlug = z.infer<typeof cmsContentPageSlugSchema>;

const text = (max: number) => z.string().max(max);
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const href = z.string().trim().min(1).max(300).refine((value) => value.startsWith("/") || /^https:\/\//i.test(value), "Link must be a site-relative path or HTTPS URL");

export const cmsContentSectionDraftSchema = z.strictObject({ heading: text(160), body: text(5_000) });
export const cmsContentSectionSchema = z.strictObject({ heading: requiredText(160), body: requiredText(5_000) });
export type CmsContentSection = z.infer<typeof cmsContentSectionDraftSchema>;

export const cmsHomepageDraftSchema = z.strictObject({
  badge: text(160),
  headline: text(200),
  emphasis: text(200),
  body: text(2_000),
  primaryCtaLabel: text(120),
  primaryCtaHref: text(300),
  secondaryCtaLabel: text(120),
  secondaryCtaHref: text(300),
});
export const cmsHomepageContentSchema = z.strictObject({
  badge: text(160),
  headline: requiredText(200),
  emphasis: text(200),
  body: requiredText(2_000),
  primaryCtaLabel: requiredText(120),
  primaryCtaHref: href,
  secondaryCtaLabel: requiredText(120),
  secondaryCtaHref: href,
});
export type CmsHomepageContent = z.infer<typeof cmsHomepageDraftSchema>;
export type CmsHomepageView = CmsHomepageContent;

export const cmsContentPageDraftRequestSchema = z.strictObject({
  title: text(200),
  intro: text(2_000),
  sections: z.array(cmsContentSectionDraftSchema).min(1).max(30),
});
export const cmsContentPagePublishedBodySchema = z.strictObject({
  title: requiredText(200),
  intro: text(2_000),
  sections: z.array(cmsContentSectionSchema).min(1).max(30),
});
export const cmsContentPageViewSchema = cmsContentPagePublishedBodySchema.extend({ slug: cmsContentPageSlugSchema }).strict();
export type CmsContentPageView = z.infer<typeof cmsContentPageViewSchema>;

export const cmsHomepageAdminViewSchema = z.strictObject({
  published: cmsHomepageContentSchema,
  draft: cmsHomepageDraftSchema,
  hasUnpublishedChanges: z.boolean(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime(),
});
export type CmsHomepageAdminView = z.infer<typeof cmsHomepageAdminViewSchema>;

export const cmsContentPageAdminViewSchema = z.strictObject({
  published: cmsContentPageViewSchema,
  draft: cmsContentPageDraftRequestSchema.extend({ slug: cmsContentPageSlugSchema }).strict(),
  hasUnpublishedChanges: z.boolean(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime(),
});
export type CmsContentPageAdminView = z.infer<typeof cmsContentPageAdminViewSchema>;

export const cmsOverviewViewSchema = z.strictObject({
  homepage: z.strictObject({ title: z.string(), href: z.string(), previewHref: z.string(), hasUnpublishedChanges: z.boolean(), updatedAt: z.iso.datetime(), publishedAt: z.iso.datetime() }),
  pages: z.array(z.strictObject({ slug: cmsContentPageSlugSchema, title: z.string(), href: z.string(), previewHref: z.string(), hasUnpublishedChanges: z.boolean(), updatedAt: z.iso.datetime(), publishedAt: z.iso.datetime() })),
});
export type CmsOverviewView = z.infer<typeof cmsOverviewViewSchema>;
