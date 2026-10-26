"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Boxes, ExternalLink, FileText, Home, LayoutTemplate, Tags } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { CmsOverviewView } from "@/services/contracts";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminCmsOverviewPage() {
  const { can } = useStaff();
  const [view, setView] = useState<CmsOverviewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setView(await apiOps.cmsOverview()); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not load the CMS workspace."); }
  }, []);
  const allowed = can("settings.manage");
  useEffect(() => {
    if (!allowed) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [allowed, load]);

  if (!allowed) return <ErrorState message="Your current role cannot manage storefront content." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!view) return <LoadingState rows={5} label="Loading Storefront CMS" />;

  const draftCount = Number(view.homepage.hasUnpublishedChanges) + view.pages.filter((page) => page.hasUnpublishedChanges).length;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Storefront CMS</p><h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Content studio</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage homepage messaging and owner-editable support/policy pages without mixing editorial work into inventory operations.</p></div>
        <Button asChild variant="outline" className="h-11"><Link href="/" target="_blank"><ExternalLink className="size-4" /> View storefront</Link></Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Editable surfaces</p><p className="mt-1 text-3xl font-bold">{view.pages.length + 1}</p><p className="mt-1 text-xs text-muted-foreground">Homepage + policy/support pages</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Unpublished drafts</p><p className="mt-1 text-3xl font-bold">{draftCount}</p><p className="mt-1 text-xs text-muted-foreground">Drafts never appear publicly until Publish</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Publication model</p><p className="mt-1 text-lg font-bold">Explicit publish</p><p className="mt-1 text-xs text-muted-foreground">Every save and publish is audit logged</p></CardContent></Card>
      </div>

      <section aria-labelledby="homepage-content-heading">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/25"><CardTitle id="homepage-content-heading" className="flex items-center gap-2 text-lg"><Home className="size-5 text-primary" /> Homepage</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div><div className="flex items-center gap-2"><p className="font-semibold">Hero messaging</p><Badge variant={view.homepage.hasUnpublishedChanges ? "secondary" : "outline"}>{view.homepage.hasUnpublishedChanges ? "Draft changes" : "Published"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Headline, highlighted text, supporting copy and primary/secondary actions.</p></div>
            <div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="h-10"><Link href={view.homepage.previewHref}>Preview</Link></Button><Button asChild className="h-10"><Link href={view.homepage.href}>Edit homepage</Link></Button></div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="pages-heading" className="space-y-3">
        <div><h2 id="pages-heading" className="text-lg font-semibold">Support & policy pages</h2><p className="text-sm text-muted-foreground">Structured content keeps the public pages consistent and prevents unsafe arbitrary HTML.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          {view.pages.map((page) => (
            <Card key={page.slug}>
              <CardContent className="flex h-full flex-col p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3"><FileText className="size-5 text-primary" /><Badge variant={page.hasUnpublishedChanges ? "secondary" : "outline"}>{page.hasUnpublishedChanges ? "Draft" : "Published"}</Badge></div>
                <h3 className="mt-4 font-semibold">{page.title}</h3><p className="mt-1 text-xs text-muted-foreground">/{page.slug}</p>
                <div className="mt-5 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="h-10"><Link href={page.previewHref}>Preview</Link></Button><Button asChild size="sm" className="h-10"><Link href={page.href}>Edit page</Link></Button></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="catalogue-content-heading" className="space-y-3">
        <div><h2 id="catalogue-content-heading" className="text-lg font-semibold">Catalogue content</h2><p className="text-sm text-muted-foreground">Product facts and imagery stay with catalogue authority, but are linked here so content work has one clear starting point.</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/admin/products" className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"><Boxes className="size-5 text-primary" /><p className="mt-3 font-semibold">Products & media</p><p className="mt-1 text-xs text-muted-foreground">Descriptions, prices, publication and Product Media AI Studio.</p></Link>
          <Link href="/admin/categories" className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"><Tags className="size-5 text-primary" /><p className="mt-3 font-semibold">Categories</p><p className="mt-1 text-xs text-muted-foreground">Department names, descriptions and storefront availability.</p></Link>
          <Link href="/admin/settings" className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"><LayoutTemplate className="size-5 text-primary" /><p className="mt-3 font-semibold">Store configuration</p><p className="mt-1 text-xs text-muted-foreground">Fulfilment and business settings remain separate from editorial content.</p></Link>
        </div>
      </section>
    </div>
  );
}
