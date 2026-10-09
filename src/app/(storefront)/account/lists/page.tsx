"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { apiOps, ApiError, type CatalogProduct } from "@/services/client";
import { useCart } from "@/features/checkout/cart-store";
import { useToast } from "@/hooks/use-toast";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseMoneyToMinor } from "@/lib/money";
import { formatMoney } from "@/lib/money";
import { Heart, Plus, Repeat2, Sparkles, Trash2, WandSparkles } from "lucide-react";

interface WishItem {
  variantId: string;
  productId: string;
  name: string;
  image: string;
  priceMinor: number;
  slug: string;
}

const WISH_KEY = "vg-wishlist-v1";

export default function AccountListsPage() {
  const { toast } = useToast();
  const addToCart = useCart((s) => s.add);
  const [tab, setTab] = useState("wishlist");

  // wishlist
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);

  // repeat
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof apiOps.accountOrders>> | null>(null);

  // budget basket
  const [budget, setBudget] = useState("100");
  const [basket, setBasket] = useState<{ items: { productId: string; variantId: string; label: string; priceMinor: number; available: string }[]; totalMinor: number; note: string } | null>(null);
  const [basketBusy, setBasketBusy] = useState(false);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setWishlist(JSON.parse(localStorage.getItem(WISH_KEY) ?? "[]"));
    } catch {
      setWishlist([]);
    }
    (async () => {
      try {
        setOrders(await apiOps.accountOrders());
      } catch (e) {
        setListError(e instanceof ApiError ? e.message : "Could not load your orders.");
      }
    })();
  }, []);

  const persistWish = (next: WishItem[]) => {
    setWishlist(next);
    localStorage.setItem(WISH_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await apiOps.products({ query: search.trim(), perPage: 6 });
        setResults(r.items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const lastOrder = orders?.find((o) => ["delivered", "collected"].includes(o.fulfilmentStatus)) ?? orders?.[0];

  const repeatLastOrder = async () => {
    if (!lastOrder) return;
    try {
      const detail = await apiOps.orderStatus(lastOrder.id);
      const products = await apiOps.byVariants(detail.lines.map((l) => l.variantId));
      let added = 0;
      const skipped: string[] = [];
      for (const line of detail.lines) {
        const product = products.find((p) => p.variants.some((v) => v.id === line.variantId));
        const variant = product?.variants.find((v) => v.id === line.variantId && v.isAvailable);
        if (variant && product) {
          addToCart({
            variantId: variant.id,
            productId: product.id,
            quantity: line.quantity,
            name: `${product.name} — ${variant.name}`,
            image: product.image,
            priceMinor: variant.priceMinor,
          });
          added += 1;
        } else {
          skipped.push(line.productName);
        }
      }
      toast({
        title: `Added ${added} item${added === 1 ? "" : "s"} to your cart`,
        description: skipped.length ? `Skipped (unavailable): ${skipped.join(", ")}` : undefined,
      });
    } catch {
      toast({ title: "Could not build the repeat basket", variant: "destructive" });
    }
  };

  const generateBasket = async () => {
    const minor = parseMoneyToMinor(budget);
    if (minor === null || minor < 100) {
      setBasketError("Enter a budget of at least ₵1.00.");
      return;
    }
    setBasketError(null);
    setBasketBusy(true);
    try {
      setBasket(await apiOps.budgetBasket(minor));
    } catch (e) {
      setBasketError(e instanceof ApiError ? e.message : "Could not build a basket.");
    } finally {
      setBasketBusy(false);
    }
  };

  const addBasketToCart = async () => {
    if (!basket) return;
    const products = await apiOps.byVariants(basket.items.map((i) => i.variantId));
    let added = 0;
    for (const item of basket.items) {
      const product = products.find((p) => p.variants.some((v) => v.id === item.variantId));
      const variant = product?.variants.find((v) => v.id === item.variantId && v.isAvailable);
      if (variant && product) {
        addToCart({
          variantId: variant.id,
          productId: product.id,
          quantity: "1",
          name: `${product.name} — ${variant.name}`,
          image: product.image,
          priceMinor: variant.priceMinor,
        });
        added += 1;
      }
    }
    toast({ title: `Added ${added} basket item${added === 1 ? "" : "s"} to your cart` });
  };

  return (
    <div className="space-y-4">
      {listError ? <ErrorState message={listError} /> : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="wishlist" className="gap-1.5 px-4">
            <Heart className="size-4" aria-hidden /> Wishlist
          </TabsTrigger>
          <TabsTrigger value="repeat" className="gap-1.5 px-4">
            <Repeat2 className="size-4" aria-hidden /> Repeat shopping
          </TabsTrigger>
          <TabsTrigger value="budget" className="gap-1.5 px-4">
            <WandSparkles className="size-4" aria-hidden /> Budget basket
          </TabsTrigger>
        </TabsList>

        {/* wishlist */}
        <TabsContent value="wishlist" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wish-search">Add to your wishlist</Label>
            <Input
              id="wish-search"
              type="search"
              className="h-11"
              placeholder="Search groceries to save…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searching ? <p className="text-sm text-muted-foreground">Searching…</p> : null}
            {results.length ? (
              <ul className="divide-y rounded-xl border bg-card">
                {results.map((p) => {
                  const v = p.variants.find((x) => x.isAvailable) ?? p.variants[0];
                  const inList = wishlist.some((w) => w.variantId === v.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="relative size-10 shrink-0 overflow-hidden rounded bg-muted" aria-hidden>
                        <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {p.name} <span className="text-muted-foreground">— {v.name}</span>
                      </span>
                      <Button
                        size="sm"
                        variant={inList ? "outline" : "secondary"}
                        className="h-9"
                        disabled={!v.isAvailable || inList}
                        onClick={() =>
                          persistWish([
                            ...wishlist,
                            { variantId: v.id, productId: p.id, name: `${p.name} — ${v.name}`, image: p.image, priceMinor: v.priceMinor, slug: p.slug },
                          ])
                        }
                      >
                        <Plus className="size-4" aria-hidden /> {inList ? "Saved" : "Save"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {wishlist.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Your wishlist is empty"
              description="Search above to save items for later — you will only ever see items that are available."
            />
          ) : (
            <ul className="space-y-2">
              {wishlist.map((w) => (
                <li key={w.variantId} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                  <Link href={`/products/${w.slug}`} className="relative size-12 shrink-0 overflow-hidden rounded bg-muted" aria-hidden>
                    <Image src={w.image} alt="" fill sizes="48px" className="object-cover" />
                  </Link>
                  <Link href={`/products/${w.slug}`} className="min-w-0 flex-1 truncate font-medium hover:underline focus-visible:underline">
                    {w.name}
                  </Link>
                  <span className="tabular-nums">{formatMoney(w.priceMinor)}</span>
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      addToCart({ variantId: w.variantId, productId: w.productId, quantity: "1", name: w.name, image: w.image, priceMinor: w.priceMinor });
                      toast({ title: "Added to cart", description: w.name });
                    }}
                  >
                    Add
                  </Button>
                  <Button size="icon" variant="ghost" className="size-9" aria-label={`Remove ${w.name} from wishlist`} onClick={() => persistWish(wishlist.filter((x) => x.variantId !== w.variantId))}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* repeat */}
        <TabsContent value="repeat" className="mt-4 space-y-4">
          {orders === null ? (
            <LoadingState rows={2} label="Loading orders" />
          ) : !lastOrder ? (
            <EmptyState title="No orders to repeat yet" description="Place an order first, then repeat it in one click." action={{ label: "Start shopping", href: "/shop" }} />
          ) : (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">Repeat {lastOrder.reference}</p>
                  <p className="text-sm text-muted-foreground">
                    {lastOrder.createdAtLabel} UTC · {lastOrder.lineCount} lines · {lastOrder.totalLabel}
                  </p>
                </div>
                <Button className="h-11" onClick={repeatLastOrder}>
                  <Repeat2 className="size-4" aria-hidden /> Add available items to cart
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Items that sold out since that order are skipped and reported — availability is
                re-checked before anything is added.
              </p>
            </div>
          )}
        </TabsContent>

        {/* budget basket */}
        <TabsContent value="budget" className="mt-4 space-y-4">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="budget-input">Shopping budget (₵)</Label>
                <Input id="budget-input" className="h-11 w-32" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
              <Button className="h-11" onClick={generateBasket} disabled={basketBusy}>
                <Sparkles className="size-4" aria-hidden /> {basketBusy ? "Building…" : "Suggest a basket"}
              </Button>
            </div>
            {basketError ? <p role="alert" className="text-sm text-destructive">{basketError}</p> : null}
            <p className="text-xs text-muted-foreground">
              Deterministic demo suggestion from the current catalogue and stock. Nothing is added
              automatically — review the basket first.
            </p>
          </div>

          {basket ? (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Suggested basket · {formatMoney(basket.totalMinor)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({basket.items.length} items, prioritising staples)
                  </span>
                </p>
                <Button variant="outline" className="h-11" onClick={addBasketToCart} disabled={!basket.items.length}>
                  <Plus className="size-4" aria-hidden /> Add basket to cart
                </Button>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {basket.items.map((item) => (
                  <li key={item.variantId} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-2.5 text-sm">
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span className="tabular-nums font-medium">{formatMoney(item.priceMinor)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{basket.note}</p>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
