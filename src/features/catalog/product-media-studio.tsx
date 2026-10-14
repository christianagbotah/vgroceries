"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import type {
  AdminProductMediaView,
  CreateGenerationRequest,
  ProductBrandMode,
  ProductMediaView,
} from "@/services/contracts";
import { useStaff } from "@/features/staff/role-context";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";

interface ProductMediaStudioProps {
  productId: string;
  productName: string;
}

type StylePreset = CreateGenerationRequest["stylePreset"];
type BackgroundIntent = CreateGenerationRequest["backgroundIntent"];

const STYLE_OPTIONS: Array<{ value: StylePreset; label: string }> = [
  { value: "clean_studio", label: "Clean studio" },
  { value: "fresh_market", label: "Fresh market" },
  { value: "lifestyle_kitchen", label: "Lifestyle kitchen" },
  { value: "ghana_market", label: "Ghana market" },
];

const BACKGROUND_OPTIONS: Array<{ value: BackgroundIntent; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "plain", label: "Plain background" },
  { value: "grocery_shelf", label: "Grocery shelf" },
  { value: "kitchen_counter", label: "Kitchen counter" },
  { value: "market_display", label: "Market display" },
];

const BRAND_OPTIONS: Array<{ value: ProductBrandMode; label: string }> = [
  { value: "auto", label: "Auto detect" },
  { value: "unbranded", label: "Unbranded / fresh item" },
  { value: "branded", label: "Branded packaged item" },
];

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function MediaPreview({ media, featured = false }: { media: ProductMediaView; featured?: boolean }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
      <Image
        src={media.previewUrl}
        alt={media.altText || "Product media preview"}
        fill
        unoptimized
        sizes="(max-width: 768px) 50vw, 220px"
        className="object-cover"
      />
      <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
        {featured ? <Badge className="gap-1"><Star className="size-3" aria-hidden /> Featured</Badge> : null}
        <Badge variant="secondary" className="bg-background/90 text-[10px] capitalize">
          {statusLabel(media.source)}
        </Badge>
      </div>
    </div>
  );
}

export function ProductMediaStudio({ productId, productName }: ProductMediaStudioProps) {
  const { role, can } = useStaff();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [media, setMedia] = useState<AdminProductMediaView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [stylePreset, setStylePreset] = useState<StylePreset>("clean_studio");
  const [backgroundIntent, setBackgroundIntent] = useState<BackgroundIntent>("auto");
  const [candidateCount, setCandidateCount] = useState(4);
  const [operatorNote, setOperatorNote] = useState("");
  const [referenceMediaId, setReferenceMediaId] = useState("");

  const canEdit = can("catalog.edit");
  const canContribute = canEdit || role === "inventory_officer";

  const notifyError = useCallback((title: string, error: unknown) => {
    const description = error instanceof ApiError ? error.message : "Please try again. If this continues, check the media service and worker.";
    toast({ title, description, variant: "destructive" });
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const next = await apiOps.productMedia(productId);
      setMedia(next);
    } catch (error) {
      notifyError("Could not load product media", error);
    } finally {
      setLoading(false);
    }
  }, [notifyError, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeJobIds = useMemo(
    () => media?.generationJobs.filter((job) => job.status === "queued" || job.status === "generating").map((job) => job.id) ?? [],
    [media?.generationJobs],
  );
  const activeJobKey = activeJobIds.join(",");

  useEffect(() => {
    if (!activeJobKey) return;
    const ids = activeJobKey.split(",").filter(Boolean);
    const timer = window.setInterval(async () => {
      try {
        const jobs = await Promise.all(ids.map((jobId) => apiOps.productMediaGeneration(jobId)));
        if (jobs.some((job) => job.status !== "queued" && job.status !== "generating")) await load();
      } catch {
        // The main media load surfaces actionable errors. Polling intentionally stays quiet.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeJobKey, load]);

  const runAction = async (key: string, action: () => Promise<unknown>, successTitle: string) => {
    setBusyKey(key);
    try {
      await action();
      await load();
      toast({ title: successTitle });
    } catch (error) {
      notifyError(`${successTitle} failed`, error);
    } finally {
      setBusyKey(null);
    }
  };

  const upload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({ title: "Choose an image first", description: "Select a JPEG, PNG or WebP product image.", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("altText", altText.trim());
    await runAction("upload", () => apiOps.productMediaUpload(productId, formData), "Product image uploaded");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAltText("");
  };

  const generate = async () => {
    if (!media) return;
    const branded = media.resolvedBrandMode === "branded";
    if (branded && !referenceMediaId) {
      toast({
        title: "Choose a genuine packshot",
        description: "Branded products require a real reference image. AI may stage the product, but it must not invent packaging.",
        variant: "destructive",
      });
      return;
    }
    const request: CreateGenerationRequest = {
      mode: branded ? "branded_packshot_edit" : "unbranded_generation",
      stylePreset,
      backgroundIntent,
      candidateCount,
      ...(branded ? { referenceMediaId } : {}),
      ...(operatorNote.trim() ? { operatorNote: operatorNote.trim() } : {}),
    };
    const idempotencyKey = crypto.randomUUID();
    await runAction(
      "generate",
      () => apiOps.productMediaGenerate(productId, request, idempotencyKey),
      "AI generation queued",
    );
  };

  const approve = (item: ProductMediaView) => runAction(`approve:${item.id}`, () => apiOps.productMediaApprove(item.id), "Media approved");
  const reject = (item: ProductMediaView) => runAction(`reject:${item.id}`, () => apiOps.productMediaReject(item.id), "Media rejected");
  const archive = (item: ProductMediaView) => runAction(`archive:${item.id}`, () => apiOps.productMediaArchive(item.id), "Media archived");
  const setFeatured = (item: ProductMediaView) => runAction(`featured:${item.id}`, () => apiOps.productMediaSetFeatured(productId, item.id), "Featured image updated");

  const moveGallery = async (index: number, direction: -1 | 1) => {
    if (!media) return;
    const target = index + direction;
    if (target < 0 || target >= media.approvedGallery.length) return;
    const ordered = media.approvedGallery.map((item) => item.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await runAction("reorder", () => apiOps.productMediaReorder(productId, ordered), "Gallery order updated");
  };

  const changeBrandMode = async (brandMode: ProductBrandMode) => {
    await runAction("brand-mode", () => apiOps.productMediaBrandMode(productId, brandMode), "Brand mode updated");
    if (brandMode === "unbranded") setReferenceMediaId("");
  };

  const referenceOptions = useMemo(() => {
    if (!media) return [];
    const items = [media.featuredMedia, ...media.approvedGallery, ...media.reviewCandidates].filter(Boolean) as ProductMediaView[];
    const seen = new Set<string>();
    return items.filter((item) => (item.source === "upload" || item.source === "legacy_import") && !seen.has(item.id) && seen.add(item.id));
  }, [media]);

  const isFeatured = (item: ProductMediaView) => media?.featuredMedia?.id === item.id;

  return (
    <section aria-labelledby="product-media-studio-heading" data-product-id={productId} className="space-y-4">
      <Card className="overflow-hidden border-primary/15">
        <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-amber-50/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle id="product-media-studio-heading" className="flex items-center gap-2 text-xl">
                <Sparkles className="size-5 text-primary" aria-hidden /> Product Media Studio
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Upload genuine product photography or create reviewable AI-assisted images for {productName}. Nothing generated by AI reaches the storefront until an authorized user approves and publishes it.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          {loading && !media ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading media workspace…
            </div>
          ) : media ? (
            <>
              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Upload className="size-4 text-primary" aria-hidden />
                    <h3 className="font-semibold">Upload product image</h3>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    Best for genuine branded packshots and supplier photography. Uploads stay private until approved.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`product-media-file-${productId}`}>Image file</Label>
                      <Input
                        ref={fileInputRef}
                        id={`product-media-file-${productId}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="h-11 cursor-pointer file:cursor-pointer"
                        disabled={!canContribute || busyKey !== null}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`product-media-alt-${productId}`}>Alt text</Label>
                      <Input
                        id={`product-media-alt-${productId}`}
                        value={altText}
                        onChange={(event) => setAltText(event.target.value)}
                        placeholder="e.g. Fresh red tomatoes in a basket"
                        maxLength={1000}
                        disabled={!canContribute || busyKey !== null}
                      />
                    </div>
                    <Button className="w-full" onClick={() => void upload()} disabled={!canContribute || busyKey !== null}>
                      {busyKey === "upload" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
                      Upload image
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border bg-primary/5 p-4 xl:col-span-2">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" aria-hidden />
                      <h3 className="font-semibold">Generate with AI</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">Resolved: {media.resolvedBrandMode}</Badge>
                      {activeJobIds.length ? <Badge className="gap-1"><Loader2 className="size-3 animate-spin" aria-hidden /> {activeJobIds.length} active</Badge> : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <Label htmlFor={`media-style-${productId}`}>Style</Label>
                      <select
                        id={`media-style-${productId}`}
                        value={stylePreset}
                        onChange={(event) => setStylePreset(event.target.value as StylePreset)}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={!canContribute || busyKey !== null}
                      >
                        {STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`media-bg-${productId}`}>Background</Label>
                      <select
                        id={`media-bg-${productId}`}
                        value={backgroundIntent}
                        onChange={(event) => setBackgroundIntent(event.target.value as BackgroundIntent)}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={!canContribute || busyKey !== null}
                      >
                        {BACKGROUND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`media-count-${productId}`}>Candidates</Label>
                      <select
                        id={`media-count-${productId}`}
                        value={candidateCount}
                        onChange={(event) => setCandidateCount(Number(event.target.value))}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={!canContribute || busyKey !== null}
                      >
                        {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`media-brand-${productId}`}>Brand mode</Label>
                      <select
                        id={`media-brand-${productId}`}
                        value={media.brandMode}
                        onChange={(event) => void changeBrandMode(event.target.value as ProductBrandMode)}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={!canEdit || busyKey !== null}
                      >
                        {BRAND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {media.resolvedBrandMode === "branded" ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p className="font-semibold">Branded product safeguard</p>
                      <p className="mt-1 text-xs leading-relaxed">
                        Choose a genuine uploaded packshot. AI will edit/stage that reference instead of inventing a label, logo or package.
                      </p>
                      <Label htmlFor={`media-reference-${productId}`} className="mt-3 block">Reference packshot</Label>
                      <select
                        id={`media-reference-${productId}`}
                        value={referenceMediaId}
                        onChange={(event) => setReferenceMediaId(event.target.value)}
                        className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={!canContribute || busyKey !== null}
                      >
                        <option value="">Choose genuine upload…</option>
                        {referenceOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.altText || item.originalFilename || item.id}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <Label htmlFor={`media-note-${productId}`}>Operator note (optional)</Label>
                    <Input
                      id={`media-note-${productId}`}
                      value={operatorNote}
                      onChange={(event) => setOperatorNote(event.target.value)}
                      maxLength={500}
                      placeholder="e.g. keep produce natural, no text overlays"
                      disabled={!canContribute || busyKey !== null}
                    />
                  </div>

                  <Button className="mt-3 min-w-44" onClick={() => void generate()} disabled={!canContribute || busyKey !== null}>
                    {busyKey === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                    Generate with AI
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Review candidates</h3>
                      <p className="text-xs text-muted-foreground">Private until an authorized reviewer approves them.</p>
                    </div>
                    <Badge variant="secondary">{media.reviewCandidates.length}</Badge>
                  </div>

                  {media.reviewCandidates.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {media.reviewCandidates.map((item) => (
                        <article key={item.id} className="space-y-2 rounded-xl border p-2">
                          <MediaPreview media={item} />
                          <div className="px-1">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="capitalize">{statusLabel(item.status)}</Badge>
                              <Badge variant="secondary" className="capitalize">{statusLabel(item.source)}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.altText || "No alt text yet"}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" onClick={() => void approve(item)} disabled={!canEdit || busyKey !== null}>
                              {busyKey === `approve:${item.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />} Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void reject(item)} disabled={!canEdit || busyKey !== null}>
                              {busyKey === `reject:${item.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />} Reject
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      <ImageIcon className="mx-auto mb-2 size-6 opacity-60" aria-hidden />
                      No images are waiting for review.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3">
                    <h3 className="font-semibold">Featured image</h3>
                    <p className="text-xs text-muted-foreground">The primary approved image shown on product cards and detail pages.</p>
                  </div>
                  {media.featuredMedia ? (
                    <div className="space-y-2">
                      <MediaPreview media={media.featuredMedia} featured />
                      <p className="text-xs text-muted-foreground">{media.featuredMedia.altText || "Featured product image"}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No featured image selected.</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Approved gallery</h3>
                    <p className="text-xs text-muted-foreground">Only approved media can be featured or ordered for the storefront.</p>
                  </div>
                  <Badge variant="secondary">{media.approvedGallery.length}</Badge>
                </div>

                {media.approvedGallery.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {media.approvedGallery.map((item, index) => {
                      const featured = isFeatured(item);
                      return (
                        <article key={item.id} className="space-y-2 rounded-xl border p-2">
                          <MediaPreview media={item} featured={featured} />
                          <p className="line-clamp-2 px-1 text-xs text-muted-foreground">{item.altText || "Approved product image"}</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Button size="sm" variant={featured ? "secondary" : "outline"} onClick={() => void setFeatured(item)} disabled={!canEdit || featured || busyKey !== null}>
                              <Star className="size-3.5" aria-hidden /> {featured ? "Featured" : "Set featured"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void archive(item)} disabled={!canEdit || featured || busyKey !== null} title={featured ? "Choose another featured image before archiving this one." : undefined}>
                              <Archive className="size-3.5" aria-hidden /> Archive
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void moveGallery(index, -1)} disabled={!canEdit || index === 0 || busyKey !== null}>
                              <ArrowUp className="size-3.5" aria-hidden /> Move up
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void moveGallery(index, 1)} disabled={!canEdit || index === media.approvedGallery.length - 1 || busyKey !== null}>
                              <ArrowDown className="size-3.5" aria-hidden /> Move down
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Approve an upload or AI candidate to build the gallery.</div>
                )}
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Generation activity</h3>
                    <p className="text-xs text-muted-foreground">Durable jobs continue in the worker even if this page is closed.</p>
                  </div>
                  <Badge variant="secondary">{media.generationJobs.length}</Badge>
                </div>
                {media.generationJobs.length ? (
                  <div className="space-y-2">
                    {media.generationJobs.slice(0, 8).map((job) => (
                      <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            {(job.status === "queued" || job.status === "generating") ? <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> : null}
                            <span className="font-medium capitalize">{statusLabel(job.status)}</span>
                            <Badge variant="outline" className="capitalize">{statusLabel(job.mode)}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{job.candidateCount} candidate(s) · attempt {job.attemptCount} · {job.provider}/{job.model}</p>
                          {job.errorMessage ? <p className="mt-1 text-xs text-destructive">{job.errorMessage}</p> : null}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => void apiOps.productMediaGeneration(job.id).then(load).catch((error) => notifyError("Could not refresh generation", error))}>
                          Refresh job
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No AI generation jobs yet.</p>}
              </div>

              {!canEdit ? (
                <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                  Your role can prepare media, but approval, publishing, featured-image, gallery-order and Brand mode changes require catalogue editing authority.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Media data is unavailable. Use Refresh after checking the API connection.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
