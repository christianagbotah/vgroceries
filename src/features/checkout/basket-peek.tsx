"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Leaf, PackageCheck, ShoppingBag, ShoppingBasket, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/checkout/cart-store";
import { CART_IMPACT_EVENT } from "@/features/checkout/cart-motion";
import { formatMoney } from "@/lib/money";
import { basketSnapshotSubtotal, OPEN_BASKET_PEEK_EVENT } from "./basket-peek-model";

const FLASH_MS = 4500;

function safeBasketImage(image: string): string {
  if (typeof image !== "string" || image.length > 2048) return "/brand/variety-mark.svg";
  if (image.startsWith("/") && !image.startsWith("//") && !image.includes("\\"))
    return image;
  try {
    const url = new URL(image);
    if (url.protocol === "https:" && !url.username && !url.password &&
        url.hostname && url.port === "" && !url.searchParams.has("token"))
      return image;
  } catch { /* invalid local-storage image path */ }
  return "/brand/variety-mark.svg";
}

/**
 * One accessible basket preview that follows the real local cart state.
 * It does not call the API, reserve inventory, charge money or suggest
 * that client-persisted snapshot prices are verified.
 */
export function BasketPeekDock() {
  const lines = useCart(state => state.lines);
  const remove = useCart(state => state.remove);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const reducedMotion = useReducedMotion();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estimated = basketSnapshotSubtotal(lines);
  const totalQuantity = lines.reduce((total, line) => {
    const n = Number(line.quantity);
    return Number.isFinite(n) && n > 0 && total < 1e6 ? total + n : total;
  }, 0);

  useEffect(() => {
    const clear = () => {
      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
    };
    const onImpact = () => {
      clear();
      setFlash(true);
      flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
    };
    const onPeek = () => {
      clear();
      setFlash(false);
      setOpen(true);
    };
    window.addEventListener(CART_IMPACT_EVENT, onImpact);
    window.addEventListener(OPEN_BASKET_PEEK_EVENT, onPeek);
    return () => {
      clear();
      window.removeEventListener(CART_IMPACT_EVENT, onImpact);
      window.removeEventListener(OPEN_BASKET_PEEK_EVENT, onPeek);
    };
  }, []);

  const reveal = () => {
    setFlash(false);
    setOpen(true);
  };

  return (
    <>
      <AnimatePresence>
        {flash && lines.length > 0 && !open ? (
          <motion.div
            key="cart-added-peek"
            initial={reducedMotion ? false : { opacity: 0, y: 22, scale: .94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 10, scale: .97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30, duration: .38 }}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-[55] flex max-w-[min(92vw,345px)] items-center gap-2 rounded-2xl border border-[#8fb89e]/60 bg-[#0a4931] p-2.5 text-white shadow-[0_20px_50px_rgba(5,49,32,.35)] md:bottom-5 md:right-6"
            role="status"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <ShoppingBasket className="size-5 text-[#f7d28b]" aria-hidden />
            </span>
            <button type="button" onClick={reveal}
              className="min-h-10 min-w-0 flex-1 text-left focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-white">
              <span className="block text-sm font-extrabold">Added to your basket</span>
              <span className="flex items-center gap-1 text-xs font-medium text-[#d7e8d8]">
                View {lines.length} {lines.length === 1 ? "item" : "items"} <ArrowRight className="size-3" />
              </span>
            </button>
            <button type="button" aria-label="Dismiss basket notification"
              onClick={() => setFlash(false)}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
              <X className="size-4" aria-hidden />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[min(100vw,430px)] max-w-[430px] gap-0 overflow-hidden border-l border-[#dbe7db] bg-[#f6f8f3] p-0 motion-reduce:transition-none [&>button]:text-white [&>button]:focus-visible:ring-white"
        >
          <SheetHeader className="shrink-0 bg-[#0a4931] px-6 pb-6 pt-7 text-white">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.19em] text-[#f5ca83]">
              <ShoppingBag className="size-4" aria-hidden /> Your market basket
            </p>
            <SheetTitle className="font-serif text-3xl font-black tracking-tight text-white">
              Good things inside.
            </SheetTitle>
            <SheetDescription className="text-sm leading-6 text-[#d5e8d7]">
              {lines.length > 0
                ? lines.length + " grocery " + (lines.length === 1 ? "selection" : "selections") +
                    " · " + totalQuantity.toLocaleString("en-GH") + " " +
                    (totalQuantity === 1 ? "unit" : "units") + " in your basket."
                : "Your next good grocery find starts here."}
            </SheetDescription>
          </SheetHeader>

          {lines.length > 0 ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 sm:p-5">
                <p className="mb-4 rounded-xl border border-[#dae5d6] bg-white px-3 py-2.5 text-[11px] leading-5 text-[#58725b]">
                  Basket items are not reserved. All prices and quantities are checked again at checkout.
                </p>
                <ul className="space-y-3" aria-label="Basket selections">
                  <AnimatePresence initial={false}>
                    {lines.map(line => {
                      const amount = basketSnapshotSubtotal([line]);
                      return (
                        <motion.li
                          layout={!reducedMotion}
                          key={line.variantId}
                          initial={reducedMotion ? false : { opacity: 0, x: 32, scale: .95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={reducedMotion ? undefined : { opacity: 0, x: -25, height: 0, margin: 0 }}
                          transition={{ duration: reducedMotion ? 0 : .26 }}
                          className="flex min-w-0 gap-3 overflow-hidden rounded-2xl border border-[#e1e8dc] bg-white p-3 shadow-[0_5px_20px_rgba(17,68,36,.04)]"
                        >
                          <span className="relative size-[76px] shrink-0 overflow-hidden rounded-xl bg-[#f1f5ee]">
                            <Image src={safeBasketImage(line.image)} alt="" fill sizes="76px"
                              unoptimized className="object-contain p-1" />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-extrabold leading-5 text-[#154430]">
                              {line.name}
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs text-[#647369]">
                                Qty {line.quantity} · {amount === null
                                  ? "Review amount in cart"
                                  : formatMoney(amount)}
                              </span>
                              <Button type="button" variant="destructive-ghost" size="icon"
                                onClick={() => remove(line.variantId)}
                                aria-label={"Remove " + line.name + " from basket"}
                                className="size-11 shrink-0 sm:w-auto sm:px-2 text-xs font-semibold">
                                <Trash2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Remove</span>
                              </Button>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>

              <div className="shrink-0 space-y-3 border-t border-[#dbe5d7] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_28px_rgba(29,69,39,.07)]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#617363]">
                      Indicative subtotal
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Excludes delivery and any final checkout adjustments
                    </p>
                  </div>
                  <strong className="font-serif text-[27px] font-black tabular-nums text-[#0f4c30]">
                    {estimated === null ? "Review cart" : formatMoney(estimated)}
                  </strong>
                </div>
                <Button asChild size="lg" className="min-h-12 w-full rounded-xl bg-[#0a593b] font-extrabold hover:bg-[#073e2b]">
                  <Link href="/cart" onClick={() => setOpen(false)}>
                    Review basket <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild size="sm" variant="outline" className="min-h-11 rounded-xl">
                    <Link href="/shop" onClick={() => setOpen(false)}>
                      <Leaf className="size-4" aria-hidden /> Keep shopping
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="min-h-11 rounded-xl">
                    <Link href="/checkout" onClick={() => setOpen(false)}>
                      Checkout <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
                <p className="flex items-center gap-2 text-[11px] leading-5 text-[#586c5a]">
                  <PackageCheck className="size-4 shrink-0" aria-hidden />
                  Checkout independently confirms sellable stock, current prices and delivery fees.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 py-10 text-center">
              <div className="grid size-24 place-items-center rounded-[30px] bg-[#e4eee0] text-[#1a7145]">
                <ShoppingBasket className="size-10" aria-hidden />
              </div>
              <h3 className="font-serif text-2xl font-black text-[#12452d]">
                Your basket is waiting.
              </h3>
              <p className="max-w-xs text-sm leading-6 text-[#627468]">
                Discover market favourites, pantry staples and everyday essentials.
              </p>
              <Button asChild className="min-h-12 rounded-xl px-6">
                <Link href="/shop" onClick={() => setOpen(false)}>
                  Explore groceries <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
