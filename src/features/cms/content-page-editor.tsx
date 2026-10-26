"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Plus, Save, Send, Trash2 } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { CmsContentPageAdminView, CmsContentPageSlug, CmsContentPageView, CmsContentSection } from "@/services/contracts";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const PAGE_SLUGS: CmsContentPageSlug[] = ["help", "returns-policy", "privacy", "terms"];

export function ContentPageEditor() {
  const params = useParams<{ slug: string }>();
  const slug = useMemo(() => PAGE_SLUGS.includes(params.slug as CmsContentPageSlug) ? params.slug as CmsContentPageSlug : null, [params.slug]);
  const { user, can } = useStaff();
  const { toast } = useToast();
  const [view, setView] = useState<CmsContentPageAdminView | null>(null);
  const [form, setForm] = useState<CmsContentPageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);

  const load = useCallback(async () => {
    if (!slug) { setError("This CMS page does not exist."); return; }
    try {
      const result = await apiOps.cmsContentPage(slug);
      setView(result);
      setForm(result.draft);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this content page.");
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const updateSection = (index: number, key: keyof CmsContentSection, value: string) => {
    setForm((current) => current ? { ...current, sections: current.sections.map((section, i) => i === index ? { ...section, [key]: value } : section) } : current);
  };
  const addSection = () => setForm((current) => current ? { ...current, sections: [...current.sections, { heading: "", body: "" }] } : current);
  const removeSection = (index: number) => setForm((current) => current ? { ...current, sections: current.sections.filter((_, i) => i !== index) } : current);

  const save = async () => {
    if (!form || !slug) return;
    setBusy("save");
    try {
      const result = await apiOps.cmsContentPageUpdate({ slug, title: form.title, intro: form.intro, sections: form.sections, actor: user.id });
      setView(result); setForm(result.draft);
      toast({ title: "Page draft saved", description: "Public content is unchanged until you publish." });
    } catch (e) {
      toast({ title: "Draft could not be saved", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const publish = async () => {
    if (!form || !slug) return;
    setBusy("publish");
    try {
      await apiOps.cmsContentPageUpdate({ slug, title: form.title, intro: form.intro, sections: form.sections, actor: user.id });
      const result = await apiOps.cmsContentPagePublish(slug, user.id);
      setView(result); setForm(result.draft);
      toast({ title: "Page published", description: `/${slug} now uses this content.` });
    } catch (e) {
      toast({ title: "Page could not be published", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (!can("settings.manage")) return <ErrorState message="Your current role cannot edit or publish storefront content." />;
  if (error) return <ErrorState message={error} onRetry={slug ? load : undefined} />;
  if (!view || !form || !slug) return <LoadingState rows={6} label="Loading page editor" />;
  const invalidSections = form.sections.some((section) => !section.heading.trim() || !section.body.trim());

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-bold sm:text-3xl">{form.title || "Content page"}</h1>
            <Badge variant={view.hasUnpublishedChanges ? "secondary" : "outline"}>{view.hasUnpublishedChanges ? "Draft changes" : "Published"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Storefront route: <code>/{slug}</code></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11"><Link href={`/${slug}`} target="_blank"><ExternalLink className="size-4" /> Preview</Link></Button>
          <Button variant="outline" className="h-11" onClick={save} disabled={!!busy}><Save className="size-4" /> {busy === "save" ? "Saving…" : "Save draft"}</Button>
          <Button className="h-11" onClick={publish} disabled={!!busy || !form.title.trim() || invalidSections}><Send className="size-4" /> {busy === "publish" ? "Publishing…" : "Publish"}</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Page introduction</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label htmlFor="page-title">Title</Label><Input id="page-title" className="h-11" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!form.title.trim()} /></div>
          <div><Label htmlFor="page-intro">Introduction</Label><Textarea id="page-intro" className="min-h-24" value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} /></div>
        </CardContent>
      </Card>

      <section aria-labelledby="sections-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 id="sections-heading" className="text-lg font-semibold">Content sections</h2><p className="text-sm text-muted-foreground">Keep each section focused. Empty sections cannot be published.</p></div>
          <Button type="button" variant="outline" className="h-11" onClick={addSection}><Plus className="size-4" /> Add section</Button>
        </div>
        {form.sections.map((section, index) => (
          <Card key={`${slug}-${index}`}>
            <CardContent className="grid gap-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section {index + 1}</p><Button type="button" variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => removeSection(index)} disabled={form.sections.length <= 1}><Trash2 className="size-4" /> Remove</Button></div>
              <div><Label htmlFor={`heading-${index}`}>Heading</Label><Input id={`heading-${index}`} className="h-11" value={section.heading} onChange={(e) => updateSection(index, "heading", e.target.value)} /></div>
              <div><Label htmlFor={`body-${index}`}>Body</Label><Textarea id={`body-${index}`} className="min-h-28" value={section.body} onChange={(e) => updateSection(index, "body", e.target.value)} /></div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">Last draft update: {new Date(view.updatedAt).toLocaleString()} · Last published: {new Date(view.publishedAt).toLocaleString()}. This editor stores structured text only; arbitrary HTML is intentionally not accepted.</div>
    </div>
  );
}
