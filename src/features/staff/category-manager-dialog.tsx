"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Pencil } from "lucide-react";

type CategoryRow = Awaited<ReturnType<typeof apiOps.categories>>[number];

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryRow[];
  canEdit: boolean;
  actor: string;
  onReload: () => Promise<unknown> | void;
}

export function CategoryManagerDialog({ open, onOpenChange, categories, canEdit, actor, onReload }: CategoryManagerDialogProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const beginEdit = (category: CategoryRow) => {
    setEditing(category);
    setName(category.name);
    setDescription(category.description);
    setActive(category.isActive);
  };

  const save = async () => {
    if (!editing || !name.trim()) return;
    setBusy(true);
    try {
      await apiOps.categoryUpdate({ categoryId: editing.id, name: name.trim(), description: description.trim(), isActive: active, actor });
      await onReload();
      setEditing(null);
      toast({ title: "Category updated" });
    } catch (error) {
      toast({ title: "Category update failed", description: error instanceof ApiError ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setEditing(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription>Edit category names, descriptions and storefront visibility without leaving the products page.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border">
          <div className="table-scroll max-h-[48vh]">
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
        {editing ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Edit {editing.name}</h3>
              <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> {active ? "Active" : "Hidden"}</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="category-modal-name">Name</Label><Input id="category-modal-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div><Label>Slug</Label><Input value={editing.slug} disabled className="font-mono" /></div>
            </div>
            <div><Label htmlFor="category-modal-description">Description</Label><Textarea id="category-modal-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save category"}</Button></div>
          </div>
        ) : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
