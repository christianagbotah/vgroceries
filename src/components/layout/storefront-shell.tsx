"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Menu, Search, ShoppingCart, Package, MapPin, CircleHelp } from "lucide-react";
import { useCart } from "@/features/checkout/cart-store";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/shop?category=cat_fp", label: "Fresh Produce" },
  { href: "/shop?category=cat_gs", label: "Grains & Staples" },
  { href: "/shop?category=cat_os", label: "Oils & Sauces" },
  { href: "/shop?category=cat_de", label: "Dairy & Eggs" },
  { href: "/shop?category=cat_bv", label: "Beverages" },
  { href: "/help", label: "Help" },
];

export function StorefrontHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const lines = useCart((s) => s.lines);
  const itemCount = lines.reduce((a, l) => a + Number(l.quantity), 0);

  const isActive = (href: string) => {
    const base = href.split("?")[0];
    if (base === "/shop") return pathname === "/shop" || pathname.startsWith("/categories") || pathname.startsWith("/products");
    if (base === "/") return pathname === "/";
    return pathname === base || pathname.startsWith(base + "/");
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      {/* utility strip */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-1.5 text-xs sm:text-[13px]">
          <p className="truncate">Fresh groceries across Accra — delivery and collection (demo)</p>
          <div className="hidden items-center gap-4 sm:flex">
            <Link href="/track" className="inline-flex items-center gap-1 hover:underline focus-visible:underline">
              <Package className="size-3.5" aria-hidden /> Track order
            </Link>
            <Link href="/help" className="inline-flex items-center gap-1 hover:underline focus-visible:underline">
              <CircleHelp className="size-3.5" aria-hidden /> Help
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center gap-3 lg:h-[72px]">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="border-b p-4 font-serif text-lg">Variety Groceries</SheetTitle>
              <nav className="flex flex-col p-2" aria-label="Mobile navigation">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-lg px-3 py-3 text-[15px] hover:bg-accent",
                      isActive(item.href) && "bg-accent font-semibold"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link href="/account" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-[15px] hover:bg-accent">
                  My account
                </Link>
                <Link href="/track" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-[15px] hover:bg-accent">
                  Track an order
                </Link>
              </nav>
            </SheetContent>
          </Sheet>

          {/* text wordmark until an owner-supplied logo is available */}
          <Link href="/" className="flex items-center gap-2 focus-visible:outline-2" aria-label="Variety Groceries home">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-serif text-lg font-bold text-primary-foreground" aria-hidden>
              V
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-serif text-lg font-bold tracking-tight">Variety Groceries</span>
              <span className="text-[11px] text-muted-foreground">varietygrocery.com · Ghana</span>
            </span>
          </Link>

          {/* search */}
          <form
            className="ml-auto hidden max-w-md flex-1 items-center gap-2 md:flex"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = query.trim() ? `/shop?query=${encodeURIComponent(query.trim())}` : "/shop";
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                placeholder="Search available groceries…"
                className="h-11 pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search products"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Track an order">
              <Link href="/track">
                <MapPin className="size-5" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative size-11" aria-label={`Cart, ${itemCount} items`}>
              <Link href="/cart">
                <ShoppingCart className="size-5" aria-hidden />
                {itemCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand-amber text-[11px] font-bold text-primary-foreground">
                    {itemCount}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button asChild className="hidden h-11 px-4 sm:inline-flex">
              <Link href="/account">Account</Link>
            </Button>
          </div>
        </div>

        {/* category nav row */}
        <nav className="hidden items-center gap-1 overflow-x-auto pb-2 lg:flex" aria-label="Categories">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm hover:bg-accent",
                isActive(item.href) && "bg-accent font-semibold"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="mt-auto border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="font-serif text-lg font-bold">Variety Groceries</p>
          <p className="text-sm text-muted-foreground">
            Fresh groceries for Ghanaian homes — shop online or in store. Demo storefront for the
            varietygrocery.com prototype.
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Shop</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li><Link href="/shop" className="hover:text-foreground hover:underline">All groceries</Link></li>
            <li><Link href="/categories/fresh-produce" className="hover:text-foreground hover:underline">Fresh produce</Link></li>
            <li><Link href="/shop?sort=price-asc" className="hover:text-foreground hover:underline">Budget picks</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Orders &amp; support</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li><Link href="/track" className="hover:text-foreground hover:underline">Track an order</Link></li>
            <li><Link href="/account/returns" className="hover:text-foreground hover:underline">Returns &amp; refunds</Link></li>
            <li><Link href="/help" className="hover:text-foreground hover:underline">Help centre</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Policies</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li><Link href="/delivery" className="hover:text-foreground hover:underline">Delivery information</Link></li>
            <li><Link href="/returns-policy" className="hover:text-foreground hover:underline">Returns policy</Link></li>
            <li><Link href="/privacy" className="hover:text-foreground hover:underline">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-foreground hover:underline">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Variety Groceries (demo prototype). Prices in Ghana cedis (₵). Fictional demo data.</p>
          <p>Mobile Money · Card · Bank transfer · Cash — payment providers not yet connected.</p>
        </div>
      </div>
    </footer>
  );
}
