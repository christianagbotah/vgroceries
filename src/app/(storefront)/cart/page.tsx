"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/features/checkout/cart-store";
import { apiOps, ApiError, type CatalogProduct } from "@/services/client";
import { QuantityInput } from "@/components/shared/quantity-input";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { ArrowRight, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";

interface CartRow {
  variantId: string;
  product?: CatalogProduct;
  variant?: CatalogProduct["variants"][number];
  error?: string;
}

export default function CartPage() {
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const [rows, setRows] = useState<CartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lines.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const products = await apiOps.byVariants(lines.map((l) => l.variantId));
        const next: CartRow[] = lines.map((line) => {
          const product = products.find((p) => p.variants.some((v) => v.id === line.variantId));
          const variant = product?.variants.find((v) => v.id === line.variantId);
          return { variantId: line.variantId, product: product ?? undefined, variant: variant ?? undefined, error: variant ? undefined : "This item is no longer available." };
        });
        if (!cancelled) setRows(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load the cart.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lines]);

  const estimated = useMemo(() => {
    let subtotal = 0;
    let hasIssue = false;
    for (const line of lines) {
      const row = rows.find((r) => r.variantId === line.variantId);
      if (row?.variant?.isAvailable) subtotal += row.variant.priceMinor * Number(line.quantity);
      else hasIssue = true;
    }
    return { subtotal, hasIssue };
  }, [lines, rows]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <h1 className="mb-4 font-serif text-2xl font-bold sm:text-3xl">Your cart</h1>
        <LoadingState rows={4} label="Loading cart" />
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <h1 className="mb-4 font-serif text-2xl font-bold sm:text-3xl">Your cart</h1>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Browse the shop and add available groceries — everything listed is in stock today."
          action={{ label: "Start shopping", href: "/shop" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
      <h1 className="font-serif text-2xl font-bold sm:text-3xl">Your cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lines.length} {lines.length === 1 ? "line" : "lines"} · availability is re-checked before checkout
      </p>

      {error ? <ErrorState message={error} className="mt-4" onRetry={() => window.location.reload()} /> : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="space-y-3">
          {lines.map((line) => {
            const row = rows.find((r) => r.variantId === line.variantId);
            const variant = row?.variant;
            const product = row?.product;
            const oversold = variant ? Number(line.quantity) > Number(variant.availableToSell) : false;
            return (
              <li key={line.variantId} className="flex gap-3 rounded-xl border bg-card p-3 sm:p-4">
                {product ? (
                  <Link
                    href={`/products/${product.slug}`}
                    className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-24"
                    aria-hidden
                  >
                    <Image src={product.image} alt="" fill sizes="96px" className="object-cover" />
                  </Link>
                ) : (
                  <div className="size-20 shrink-0 rounded-lg bg-muted sm:size-24" aria-hidden />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={product ? `/products/${product.slug}` : "#"} className="font-medium hover:underline focus-visible:underline">
                        {product?.name ?? "Unavailable item"}
                      </Link>
                      <p className="text-sm text-muted-foreground">{variant?.name ?? "—"}</p>
                    </div>
                    <p className="font-bold">{variant ? formatMoney(variant.priceMinor * Number(line.quantity)) : "—"}</p>
                  </div>

                  {row?.error || !variant?.isAvailable ? (
                    <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-warning/10 border border-warning/40 p-2 text-sm">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>Currently unavailable — remove it or continue with the rest of your order.</span>
                    </p>
                  ) : oversold ? (
                    <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-warning/10 border border-warning/40 p-2 text-sm">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>Only {variant.availableToSell} left — reduce the quantity.</span>
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {variant?.isAvailable ? (
                      <QuantityInput
                        size="sm"
                        value={line.quantity}
                        onChange={(q) => setQty(line.variantId, q)}
                        max={variant.availableToSell}
                        ariaLabel={`Quantity of ${product?.name}`}
                      />
                    ) : (
                      <span />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(line.variantId)}
                      aria-label={`Remove ${product?.name ?? "item"} from cart`}
                    >
                      <Trash2 className="size-4" aria-hidden /> Remove
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit space-y-3 rounded-xl border bg-card p-4 lg:sticky lg:top-32" aria-label="Order summary">
          <h2 className="font-semibold">Estimated total</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (available items)</span>
              <span className="font-medium tabular-nums">{formatMoney(estimated.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery fee</span>
              <span>Chosen at checkout</span>
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Final prices, fees and totals are calculated by the service at checkout. Ghana tax
            treatment is configured by the owner before launch.
          </p>
          <Button asChild size="lg" className="h-12 w-full">
            <Link href="/checkout">
              Checkout <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-10 w-full">
            <Link href="/shop">Continue shopping</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
