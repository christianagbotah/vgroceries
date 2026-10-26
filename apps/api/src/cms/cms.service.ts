import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  cmsContentPageDraftRequestSchema,
  cmsContentPagePublishedBodySchema,
  cmsContentPageSlugSchema,
  cmsHomepageContentSchema,
  cmsHomepageDraftSchema,
  type CmsContentPageAdminView,
  type CmsContentPageSlug,
  type CmsContentPageView,
  type CmsHomepageAdminView,
  type CmsHomepageContent,
  type CmsOverviewView,
} from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

function changed(a: unknown, b: unknown) { return JSON.stringify(a) !== JSON.stringify(b); }
function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

@Injectable()
export class CmsService {
  constructor(private readonly db: Database) {}

  private async record(key: string) {
    const record = await this.db.cmsContent.findUnique({ where: { key } });
    if (!record) throw new ApiProblem(404, "NOT_FOUND", "CMS content not found.");
    return record;
  }

  private pageSlug(value: string): CmsContentPageSlug {
    const parsed = cmsContentPageSlugSchema.safeParse(value);
    if (!parsed.success) throw new ApiProblem(404, "NOT_FOUND", "CMS page not found.");
    return parsed.data;
  }

  async publicHomepage(): Promise<CmsHomepageContent> {
    const record = await this.record("homepage");
    const parsed = cmsHomepageContentSchema.safeParse(record.published);
    if (!parsed.success) throw new ApiProblem(500, "INTERNAL", "Published homepage content is invalid.");
    return parsed.data;
  }

  async publicPage(rawSlug: string): Promise<CmsContentPageView> {
    const slug = this.pageSlug(rawSlug);
    const record = await this.record(slug);
    const parsed = cmsContentPagePublishedBodySchema.safeParse(record.published);
    if (!parsed.success) throw new ApiProblem(500, "INTERNAL", "Published page content is invalid.");
    return { slug, ...parsed.data };
  }

  async overview(): Promise<CmsOverviewView> {
    const records = await this.db.cmsContent.findMany({ orderBy: { key: "asc" } });
    const homepage = records.find((row) => row.key === "homepage");
    if (!homepage) throw new ApiProblem(500, "INTERNAL", "Homepage CMS record is missing.");
    const pages = (["help", "returns-policy", "privacy", "terms"] as CmsContentPageSlug[]).map((slug) => {
      const row = records.find((record) => record.key === slug);
      if (!row) throw new ApiProblem(500, "INTERNAL", `CMS record ${slug} is missing.`);
      const draft = cmsContentPageDraftRequestSchema.safeParse(row.draft);
      if (!draft.success) throw new ApiProblem(500, "INTERNAL", `CMS draft ${slug} is invalid.`);
      return {
        slug,
        title: draft.data.title,
        href: `/admin/content/pages/${slug}`,
        previewHref: `/${slug}`,
        hasUnpublishedChanges: changed(row.published, row.draft),
        updatedAt: row.updatedAt.toISOString(),
        publishedAt: row.publishedAt.toISOString(),
      };
    });
    return {
      homepage: {
        title: "Homepage",
        href: "/admin/content/homepage",
        previewHref: "/",
        hasUnpublishedChanges: changed(homepage.published, homepage.draft),
        updatedAt: homepage.updatedAt.toISOString(),
        publishedAt: homepage.publishedAt.toISOString(),
      },
      pages,
    };
  }

  async adminHomepage(): Promise<CmsHomepageAdminView> {
    const record = await this.record("homepage");
    const published = cmsHomepageContentSchema.safeParse(record.published);
    const draft = cmsHomepageDraftSchema.safeParse(record.draft);
    if (!published.success || !draft.success) throw new ApiProblem(500, "INTERNAL", "Homepage CMS record is invalid.");
    return {
      published: published.data,
      draft: draft.data,
      hasUnpublishedChanges: changed(record.published, record.draft),
      updatedAt: record.updatedAt.toISOString(),
      publishedAt: record.publishedAt.toISOString(),
    };
  }

  async saveHomepage(actorId: string, requestId: string, input: CmsHomepageContent): Promise<CmsHomepageAdminView> {
    await this.db.$transaction(async (tx) => {
      await tx.cmsContent.update({ where: { key: "homepage" }, data: { draft: json(input) } });
      await tx.auditEvent.create({ data: { actorId, action: "cms.homepage_draft_saved", entityId: "homepage", requestId, details: {} } });
    });
    return this.adminHomepage();
  }

  async publishHomepage(actorId: string, requestId: string): Promise<CmsHomepageAdminView> {
    await this.db.$transaction(async (tx) => {
      const record = await tx.cmsContent.findUnique({ where: { key: "homepage" } });
      if (!record) throw new ApiProblem(404, "NOT_FOUND", "Homepage CMS record not found.");
      const parsed = cmsHomepageContentSchema.safeParse(record.draft);
      if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Homepage draft is not publishable.", parsed.error.issues);
      const now = new Date();
      await tx.cmsContent.update({ where: { key: "homepage" }, data: { published: json(parsed.data), draft: json(parsed.data), publishedAt: now } });
      await tx.auditEvent.create({ data: { actorId, action: "cms.homepage_published", entityId: "homepage", requestId, details: {} } });
    });
    return this.adminHomepage();
  }

  async adminPage(rawSlug: string): Promise<CmsContentPageAdminView> {
    const slug = this.pageSlug(rawSlug);
    const record = await this.record(slug);
    const published = cmsContentPagePublishedBodySchema.safeParse(record.published);
    const draft = cmsContentPageDraftRequestSchema.safeParse(record.draft);
    if (!published.success || !draft.success) throw new ApiProblem(500, "INTERNAL", "CMS page record is invalid.");
    return {
      published: { slug, ...published.data },
      draft: { slug, ...draft.data },
      hasUnpublishedChanges: changed(record.published, record.draft),
      updatedAt: record.updatedAt.toISOString(),
      publishedAt: record.publishedAt.toISOString(),
    };
  }

  async savePage(actorId: string, requestId: string, rawSlug: string, input: { title: string; intro: string; sections: { heading: string; body: string }[] }): Promise<CmsContentPageAdminView> {
    const slug = this.pageSlug(rawSlug);
    await this.db.$transaction(async (tx) => {
      await tx.cmsContent.update({ where: { key: slug }, data: { draft: json(input) } });
      await tx.auditEvent.create({ data: { actorId, action: "cms.page_draft_saved", entityId: slug, requestId, details: {} } });
    });
    return this.adminPage(slug);
  }

  async publishPage(actorId: string, requestId: string, rawSlug: string): Promise<CmsContentPageAdminView> {
    const slug = this.pageSlug(rawSlug);
    await this.db.$transaction(async (tx) => {
      const record = await tx.cmsContent.findUnique({ where: { key: slug } });
      if (!record) throw new ApiProblem(404, "NOT_FOUND", "CMS page not found.");
      const parsed = cmsContentPagePublishedBodySchema.safeParse(record.draft);
      if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", "Page draft is not publishable.", parsed.error.issues);
      const now = new Date();
      await tx.cmsContent.update({ where: { key: slug }, data: { published: json(parsed.data), draft: json(parsed.data), publishedAt: now } });
      await tx.auditEvent.create({ data: { actorId, action: "cms.page_published", entityId: slug, requestId, details: {} } });
    });
    return this.adminPage(slug);
  }
}
