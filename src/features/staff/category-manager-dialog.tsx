"use client";

import { useEffect, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus } from "lucide-react";

type CategoryRow = Awaited<ReturnType<typeof apiOps.categories>>[number];

type CategoryManagerMode = "list" | "create";

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryRow[];
  canEdit: boolean;
  actor: string;
  onReload: () => Promise<unknown> | void;
  initialMode?: CategoryManagerMode;
}

function slugifyCategory(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function CategoryManagerDialog({ open, onOpenChange, categories, canEdit, actor, onReload, initialMode = "list" }: CategoryManagerDialogProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setEditing(null);
    setCreating(false);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setDescription("");
    setActive(true);
  };

  const beginCreate = () => {
    setEditing(null);
    setCreating(true);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setDescription("");
    setActive(true);
  };

  const beginEdit = (category: CategoryRow) => {
    setCreating(false);
    setEditing(category);
    setName(category.name);
    setSlug(category.slug);
    setSlugTouched(true);
    setDescription(category.description);
    setActive(category.isActive);
  };

  useEffect(() => {
    if (!open) return;
    if (initialMode === "create" && canEdit) beginCreate();
    else resetForm();
    // Reset whenever the dialog is opened for a requested mode.
  }, [open, initialMode, canEdit]);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    try {
      if (creating) {
        const trimmedSlug = slug.trim();
        if (!trimmedSlug) return;
        await apiOps.categoryCreate({ name: trimmedName, slug: trimmedSlug, description: description.trim(), isActive: active, actor });
        await onReload();
        resetForm();
        toast({ title: "Category created" });
      } else if (editing) {
        await apiOps.categoryUpdate({ categoryId: editing.id, name: trimmedName, description: description.trim(), isActive: active, actor });
        await onReload();
        resetForm();
        toast({ title: "Category updated" });
      }
    } catch (error) {
      toast({ title: creating ? "Category creation failed" : "Category update failed", description: error instanceof ApiError ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const formOpen = creating || !!editing;

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) resetForm(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-7">
            <div>
              <DialogTitle>Manage categories</DialogTitle>
              <DialogDescription>Create categories and manage their names, descriptions and storefront visibility.</DialogDescription>
            </div>
            {canEdit && !creating ? (
              <Button type="button" onClick={beginCreate}><Plus className="size-4" aria-hidden /> Add category</Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border">
          <div className="table-scroll max-h-[42vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 text-left backdrop-blur">
                <tr>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="hidden p-3 font-semibold sm:table-cell">Slug</th>
                  <th className="p-3 text-right font-semibold">Products</th>
                  <th className="p-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-t">
                    <td className="p-3">
                      <p className="font-medium">{category.name}</p>
                      <Badge variant={category.isActive ? "secondary" : "outline"} className="mt-1 text-[11px]">{category.isActive ? "active" : "hidden"}</Badge>
                    </td>
                    <td className="hidden p-3 font-mono text-xs text-muted-foreground sm:table-cell">{category.slug}</td>
                    <td className="p-3 text-right tabular-nums">{category.availableCount} / {category.productCount}</td>
                    <td className="p-3 text-right">
                      {canEdit ? <Button size="sm" variant="outline" onClick={() => beginEdit(category)}><Pencil className="size-3.5" aria-hidden /> Edit</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {formOpen ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{creating ? "Add category" : `Edit ${editing?.name ?? "category"}`}</h3>
              <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> {active ? "Active" : "Hidden"}</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="category-modal-name">Name</Label>
                <Input
                  id="category-modal-name"
                  value={name}
                  onChange={(event) => {
                    const value = event.target.value;
                    setName(value);
                    if (creating && !slugTouched) setSlug(slugifyCategory(value));
                  }}
                  placeholder="e.g. Breakfast & Cereals"
                />
              </div>
              <div>
                <Label htmlFor="category-modal-slug">Slug</Label>
                <Input
                  id="category-modal-slug"
                  value={slug}
                  disabled={!creating}
                  className="font-mono"
                  onChange={(event) => { setSlug(slugifyCategory(event.target.value)); setSlugTouched(true); }}
                  placeholder="breakfast-cereals"
                />
                {creating ? <p className="mt-1 text-xs text-muted-foreground">Generated from the name. You can edit it before saving.</p> : null}
              </div>
            </div>
            <div><Label htmlFor="category-modal-description">Description</Label><Textarea id="category-modal-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What customers will find in this category." /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy || !name.trim() || (creating && !slug.trim())}>{busy ? "Saving…" : creating ? "Create category" : "Save category"}</Button>
            </div>
          </div>
        ) : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
