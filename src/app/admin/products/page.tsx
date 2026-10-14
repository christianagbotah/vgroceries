"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiOps, ApiError } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Boxes, Plus } from "lucide-react";
import { useApiData } from "@/features/staff/admin-data";

type ProductRow = Awaited<ReturnType<typeof apiOps.adminProducts>>[number];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export default function AdminProductsPage() {
  const router = useRouter();
  const { can } = useStaff();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApiData(() => apiOps.adminProducts(q || undefined), [q]);
  const { data: categories, loading: categoriesLoading, error: categoriesError } = useApiData(() => apiOps.categories(), []);
  const [searchInput, setSearchInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const resetDraftForm = () => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setCategoryId("");
    setShortDescription("");
    setDescription("");
  };

  const createDraft = async () => {
    const cleanName = name.trim();
    const cleanSlug = slugify(slug || name);
    if (!cleanName || !cleanSlug || !categoryId) {
      toast({
        title: "Complete the required product details",
        description: "Product name, category and slug are required before the draft can be created.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const result = await apiOps.productDraftCreate({
        name: cleanName,
        categoryId: categoryId,
        slug: cleanSlug,
        shortDescription: shortDescription.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast({
        title: "Product draft created",
        description: "The unpublished draft is ready for product details, genuine uploads and AI-assisted media.",
      });
      setAddOpen(false);
      resetDraftForm();
      router.push(result.editorPath);
    } catch (e) {
      toast({
        title: "Could not create product draft",
        description: e instanceof ApiError ? e.message : "Please check the catalogue service and try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  if (loading && !data) return <LoadingState rows={6} label="Loading products" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];
  const activeCategories = (categories ?? []).filter((category) => category.isActive);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} products · variants, prices, availability, media and publication.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("catalog.view") ? (
            <Link href="/admin/categories" className="text-sm font-medium text-primary hover:underline focus-visible:underline">Manage categories</Link>
          ) : null}
          {can("catalog.edit") ? (
            <Button className="h-10" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden /> Add product
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" className="h-11 pl-9" placeholder="Search products…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search products" />
      </div>

      {!rows.length ? (
        <EmptyState icon={Boxes} title="No products match" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Product</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Variants & prices</th>
                  <th className="p-3 font-semibold">Publication</th>
                  <th className="p-3 text-right font-semibold">Availability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: ProductRow) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted" aria-hidden>
                          <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />
                        </span>
                        <div className="min-w-0">
                          <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline focus-visible:underline">{p.name}</Link>
                          <p className="truncate text-xs text-muted-foreground">{p.shortDescription}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.categoryName}</td>
                    <td className="p-3">
                      <ul className="space-y-0.5 text-xs">
                        {p.variants.slice(0, 3).map((v) => (
                          <li key={v.id}>
                            <span className="font-medium">{v.priceLabel}</span> · {v.name}
                            {!v.isAvailable ? <span className="ml-1 text-destructive">(0 avail)</span> : <span className="ml-1 text-muted-foreground">({v.availableToSell})</span>}
                          </li>
                        ))}
                        {p.variants.length > 3 ? <li className="text-muted-foreground">+{p.variants.length - 3} more…</li> : null}
                      </ul>
                    </td>
                    <td className="p-3">
                      {p.isPublished ? (
                        <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Published</Badge>
                      ) : (
                        <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Unpublished</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {p.anyAvailable ? (
                        <Badge variant="secondary">In stock</Badge>
                      ) : (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[color:var(--warning-foreground)]">No sellable stock</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Zero-availability products stay published in the catalogue but are hidden from storefront
        lists, search, recommendations and offers; saved links show a clear unavailable state.
      </p>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open && !creating) resetDraftForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Create an unpublished draft first. You will move straight into the product editor where you can add variants, upload genuine images, generate AI-assisted media and review everything before publication.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-product-name">Product name *</Label>
              <Input
                id="new-product-name"
                autoFocus
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  if (!slugTouched) setSlug(slugify(value));
                }}
                placeholder="e.g. Fresh Garden Eggs"
                disabled={creating}
              />
            </div>

            <div>
              <Label htmlFor="new-product-category">Category *</Label>
              <select
                id="new-product-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                disabled={creating || categoriesLoading || !!categoriesError}
              >
                <option value="">{categoriesLoading ? "Loading categories…" : "Choose category…"}</option>
                {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              {categoriesError ? <p className="mt-1 text-xs text-destructive">Categories could not be loaded. Close this dialog and try again.</p> : null}
            </div>

            <div>
              <Label htmlFor="new-product-slug">Slug *</Label>
              <Input
                id="new-product-slug"
                value={slug}
                onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }}
                placeholder="fresh-garden-eggs"
                disabled={creating}
              />
              <p className="mt-1 text-xs text-muted-foreground">Stable storefront identifier. You can edit the suggested value before creating the draft.</p>
            </div>

            <div>
              <Label htmlFor="new-product-short">Short description</Label>
              <Input
                id="new-product-short"
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                maxLength={240}
                placeholder="Short card/search description"
                disabled={creating}
              />
            </div>

            <div>
              <Label htmlFor="new-product-description">Description</Label>
              <Textarea
                id="new-product-description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional product detail copy. You can continue editing it after the draft opens."
                disabled={creating}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={() => void createDraft()} disabled={creating || categoriesLoading || !!categoriesError}>
              {creating ? "Creating draft…" : "Create unpublished draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
