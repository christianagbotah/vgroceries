"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiOps, ApiError } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { parseMoneyToMinor } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Pencil, Eye, EyeOff, Package, Warehouse } from "lucide-react";

type ProductDetail = Awaited<ReturnType<typeof apiOps.adminProduct>>;

export default function AdminProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useStaff();
  const { toast } = useToast();
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceTarget, setPriceTarget] = useState<ProductDetail["variants"][number] | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [priceReason, setPriceReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await apiOps.adminProduct(id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this product.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePublication = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await apiOps.productUpdate({ productId: detail.id, isPublished: !detail.isPublished, actor: user.id });
      await load();
      toast({ title: detail.isPublished ? "Product unpublished" : "Product published" });
    } catch (e) {
      toast({ title: "Change failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const savePrice = async () => {
    if (!priceTarget) return;
    const minor = parseMoneyToMinor(priceInput);
    if (minor === null || minor <= 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiOps.variantUpdate({ variantId: priceTarget.id, priceMinor: minor, reason: priceReason.trim() || "Price review", actor: user.id });
      await load();
      setPriceTarget(null);
      setPriceInput("");
      setPriceReason("");
      toast({ title: "Price updated", description: "The audit log records before/after values." });
    } catch (e) {
      toast({ title: "Price change failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!detail) return <LoadingState rows={5} label="Loading product" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-xl border bg-muted" aria-hidden>
            <Image src={detail.image} alt="" fill sizes="80px" className="object-cover" />
          </span>
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link href="/admin/products" className="hover:underline focus-visible:underline">Products</Link>
              <span aria-hidden> / </span> <span>{detail.name}</span>
            </nav>
            <h1 className="mt-1 font-serif text-2xl font-bold">{detail.name}</h1>
            <p className="text-sm text-muted-foreground">{detail.categoryName} · {detail.variants.length} variant(s)</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/products/${detail.slug}`} className="text-sm font-medium text-primary hover:underline focus-visible:underline">
            View on storefront
          </Link>
          {can("catalog.edit") ? (
            <Button variant="outline" className="h-10" onClick={togglePublication} disabled={busy}>
              {detail.isPublished ? <><EyeOff className="size-4" aria-hidden /> Unpublish</> : <><Eye className="size-4" aria-hidden /> Publish</>}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">{detail.shortDescription}</p>
        <p className="mt-2 text-sm leading-relaxed">{detail.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
        </div>
      </div>

      {/* variants */}
      <section aria-labelledby="variants-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="variants-heading" className="border-b p-4 font-semibold">Variants, pricing & availability</h2>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Variant</th>
                <th className="p-3 text-right font-semibold">Price</th>
                <th className="p-3 font-semibold">Barcode</th>
                <th className="hidden p-3 font-semibold md:table-cell">Purchasing unit</th>
                <th className="p-3 text-right font-semibold">Sellable / reserved / available</th>
                <th className="p-3 text-right font-semibold">Edit</th>
              </tr>
            </thead>
            <tbody>
              {detail.variants.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.unitSize} · safety {v.safetyStock}</p>
                  </td>
                  <td className="p-3 text-right">
                    <p className="font-semibold tabular-nums">{v.priceLabel}</p>
                    {v.compareAtPriceMinor ? <p className="text-xs text-muted-foreground line-through">₵{(v.compareAtPriceMinor / 100).toFixed(2)}</p> : null}
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{v.barcode ?? "—"}</td>
                  <td className="hidden p-3 text-xs text-muted-foreground md:table-cell">
                    {v.purchaseUnit ? `1 ${v.purchaseUnit.altUnit} = ${v.purchaseUnit.factor} ${v.purchaseUnit.baseUnit}` : "—"}
                  </td>
                  <td className="p-3 text-right text-xs">
                    <span className="tabular-nums">{v.availability.sellablePhysical}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="tabular-nums text-primary">{v.availability.reserved}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className={`tabular-nums font-semibold ${Number(v.availability.availableToSell) === 0 ? "text-destructive" : ""}`}>{v.availability.availableToSell}</span>
                  </td>
                  <td className="p-3 text-right">
                    {can("catalog.edit") ? (
                      <Button size="sm" variant="outline" className="h-9" onClick={() => { setPriceTarget(v); setPriceInput((v.priceMinor / 100).toFixed(2)); setPriceReason(""); }}>
                        <Pencil className="size-3.5" aria-hidden /> Price
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* lots */}
      <section aria-labelledby="lots-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="lots-heading" className="flex items-center gap-2 border-b p-4 font-semibold">
          <Warehouse className="size-5 text-primary" aria-hidden /> Lots
        </h2>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Lot</th>
                <th className="p-3 text-right font-semibold">Quantity</th>
                <th className="p-3 font-semibold">Kind</th>
                <th className="p-3 font-semibold">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {detail.lots.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{l.lotNumber}</td>
                  <td className="p-3 text-right tabular-nums">{l.quantity}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={l.kind === "regular" && !l.isQuarantined ? "" : "border-warning/40 bg-warning/10 text-[color:var(--warning-foreground)]"}>
                      {l.isQuarantined ? "quarantined" : l.kind}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{l.expiryDate ? formatDate(l.expiryDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* movements */}
      <section aria-labelledby="mov-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="mov-heading" className="flex items-center gap-2 border-b p-4 font-semibold">
          <Package className="size-5 text-primary" aria-hidden /> Recent movements
        </h2>
        {!detail.movements.length ? (
          <p className="p-4 text-sm text-muted-foreground">No movements recorded for this product yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {detail.movements.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  <span className="font-semibold tabular-nums">{m.delta.startsWith("-") ? m.delta : `+${m.delta}`}</span>{" "}
                  <span className="text-muted-foreground">{m.reason.replace(/_/g, " ")}{m.note ? ` · ${m.note}` : ""} · resulting {m.resultingQty}</span>
                </span>
                <span className="text-xs text-muted-foreground">{m.atLabel} UTC</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* price dialog */}
      <Dialog open={!!priceTarget} onOpenChange={(o) => !o && setPriceTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change price — {priceTarget?.name}</DialogTitle>
            <DialogDescription>
              Price changes are permission-gated and recorded in the audit log with before/after values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="price-input">New price (₵)</Label>
              <Input id="price-input" className="h-11" inputMode="decimal" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="e.g. 12.50" />
            </div>
            <div>
              <Label htmlFor="price-reason">Reason</Label>
              <Input id="price-reason" className="h-11" value={priceReason} onChange={(e) => setPriceReason(e.target.value)} placeholder="e.g. supplier price update" />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-11" onClick={savePrice} disabled={busy}>{busy ? "Saving…" : "Save price"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
