"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Eye, Save, Send, Sparkles } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { CmsHomepageAdminView, CmsHomepageContent } from "@/services/contracts";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const fieldClass = "min-h-11";

export function HomepageEditor() {
  const { can } = useStaff();
  const { toast } = useToast();
  const [view, setView] = useState<CmsHomepageAdminView | null>(null);
  const [form, setForm] = useState<CmsHomepageContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiOps.cmsHomepage();
      setView(result);
      setForm(result.draft);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load homepage content.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key: keyof CmsHomepageContent, value: string) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!form) return;
    setBusy("save");
    try {
      const result = await apiOps.cmsHomepageUpdate(form);
      setView(result);
      setForm(result.draft);
      toast({ title: "Homepage draft saved", description: "The public storefront has not changed yet." });
    } catch (e) {
      toast({ title: "Draft could not be saved", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const publish = async () => {
    if (!form) return;
    setBusy("publish");
    try {
      await apiOps.cmsHomepageUpdate(form);
      const result = await apiOps.cmsHomepagePublish();
      setView(result);
      setForm(result.draft);
      toast({ title: "Homepage published", description: "The storefront now uses this hero content." });
    } catch (e) {
      toast({ title: "Homepage could not be published", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (!can("settings.manage")) {
    return <ErrorState message="Your current role cannot edit or publish storefront content." />;
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!view || !form) return <LoadingState rows={6} label="Loading homepage editor" />;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-bold sm:text-3xl">Homepage</h1>
            <Badge variant={view.hasUnpublishedChanges ? "secondary" : "outline"}>
              {view.hasUnpublishedChanges ? "Draft changes" : "Published"}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Edit the storefront hero. Save keeps a private draft; Publish promotes the current draft to the public site.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/" target="_blank"><ExternalLink className="size-4" /> View storefront</Link>
          </Button>
          <Button variant="outline" className="h-11" onClick={save} disabled={!!busy}>
            <Save className="size-4" /> {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          <Button className="h-11" onClick={publish} disabled={!!busy || !form.headline.trim()}>
            <Send className="size-4" /> {busy === "publish" ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)]">
        <Card>
          <CardHeader><CardTitle className="text-lg">Hero content</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="hero-badge">Badge / eyebrow</Label>
              <Input id="hero-badge" className={fieldClass} value={form.badge} onChange={(e) => update("badge", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hero-headline">Headline</Label>
              <Input id="hero-headline" className={fieldClass} value={form.headline} onChange={(e) => update("headline", e.target.value)} aria-invalid={!form.headline.trim()} />
              {!form.headline.trim() ? <p className="mt-1 text-xs text-destructive">Headline is required to publish.</p> : null}
            </div>
            <div>
              <Label htmlFor="hero-emphasis">Highlighted text</Label>
              <Input id="hero-emphasis" className={fieldClass} value={form.emphasis} onChange={(e) => update("emphasis", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="hero-body">Supporting copy</Label>
              <Textarea id="hero-body" className="min-h-28" value={form.body} onChange={(e) => update("body", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="primary-label">Primary button label</Label>
              <Input id="primary-label" className={fieldClass} value={form.primaryCtaLabel} onChange={(e) => update("primaryCtaLabel", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="primary-href">Primary button link</Label>
              <Input id="primary-href" className={fieldClass} value={form.primaryCtaHref} onChange={(e) => update("primaryCtaHref", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="secondary-label">Secondary button label</Label>
              <Input id="secondary-label" className={fieldClass} value={form.secondaryCtaLabel} onChange={(e) => update("secondaryCtaLabel", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="secondary-href">Secondary button link</Label>
              <Input id="secondary-href" className={fieldClass} value={form.secondaryCtaHref} onChange={(e) => update("secondaryCtaHref", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="flex items-center gap-2 text-base"><Eye className="size-4 text-primary" /> Draft preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="min-h-[360px] bg-[#eef4e8] p-6 sm:p-8">
                <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-primary shadow-sm">{form.badge || "Badge"}</span>
                <h2 className="mt-5 font-serif text-4xl font-black leading-[.96] text-[color:var(--brand-green-deep)] sm:text-5xl">
                  {form.headline || "Homepage headline"} <span className="text-brand-amber">{form.emphasis}</span>
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-foreground/75">{form.body || "Supporting copy appears here."}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{form.primaryCtaLabel || "Primary action"}</span>
                  <span className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold"><Sparkles className="mr-1 inline size-4 text-brand-amber" /> {form.secondaryCtaLabel || "Secondary action"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs leading-relaxed text-muted-foreground">Last draft update: {new Date(view.updatedAt).toLocaleString()} · Last published: {new Date(view.publishedAt).toLocaleString()}. Publishing in this prototype updates the shared demo service; production persistence still belongs to the backend.</p>
        </div>
      </div>
    </div>
  );
}
