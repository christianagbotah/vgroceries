"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList } from "lucide-react";

type CategoryRow = Awaited<ReturnType<typeof apiOps.categories>>[number];

export default function AdminCategoriesPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.categories(), []);
  const [edit, setEdit] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await apiOps.categoryUpdate({ categoryId: edit.id, name: name.trim() || undefined, description: description.trim() || undefined, actor: user.id });
      await reload();
      setEdit(null);
      toast({ title: "Category updated" });
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={4} label="Loading categories" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Category management: names, descriptions and active state. Slugs are stable identifiers.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Slug</th>
                <th className="hidden p-3 font-semibold md:table-cell">Description</th>
                <th className="p-3 text-right font-semibold">Products</th>
                <th className="p-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c: CategoryRow) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{c.name}</p>
                    <Badge variant={c.isActive ? "secondary" : "outline"} className="mt-0.5 text-[11px]">
                      {c.isActive ? "active" : "hidden"}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{c.slug}</td>
                  <td className="hidden max-w-sm truncate p-3 text-muted-foreground md:table-cell">{c.description}</td>
                  <td className="p-3 text-right text-sm">
                    <span className="tabular-nums font-medium">{c.availableCount}</span>
                    <span className="text-muted-foreground"> / {c.productCount} available</span>
                  </td>
                  <td className="p-3 text-right">
                    {can("catalog.edit") ? (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => { setEdit(c); setName(c.name); setDescription(c.description); }}>
                        Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {edit ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardList className="size-5 text-primary" aria-hidden /> Edit “{edit.name}”
          </h2>
          <div>
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea id="cat-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button className="h-11" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
            <Button variant="outline" className="h-11" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
