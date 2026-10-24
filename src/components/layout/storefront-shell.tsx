"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  CircleHelp,
  Heart,
  House,
  MapPin,
  Menu,
  Package,
  Search,
  ShoppingCart,
  Store,
  UserRound,
} from "lucide-react";
import { useCart } from "@/features/checkout/cart-store";

const CATEGORY_NAV = [
  { slug: "fresh-produce", label: "Fresh Produce" },
  { slug: "grains-staples", label: "Grains & Staples" },
  { slug: "oils-sauces", label: "Oils & Sauces" },
  { slug: "dairy-eggs", label: "Dairy & Eggs" },
  { slug: "beverages", label: "Beverages" },
  { slug: "snacks", label: "Snacks" },
  { slug: "household", label: "Household Care" },
  { slug: "personal-care", label: "Personal Care" },
  { slug: "meat-fish", label: "Meat & Fish" },
  { slug: "baby-family", label: "Baby & Family" },
] as const;

type NavItem = { href: string; label: string; category?: string };

const NAV: NavItem[] = [
  { href: "/shop", label: "All groceries" },
  ...CATEGORY_NAV.slice(0, 6).map((category) => ({
    href: `/shop?category=${category.slug}`,
    label: category.label,
    category: category.slug,
  })),
  { href: "/help", label: "Help" },
];

function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 focus-visible:rounded-lg" aria-label="Variety Groceries home">
      <Image src="/brand/variety-mark.svg" alt="" width={48} height={48} className={compact ? "size-9" : "size-11 sm:size-12"} priority />
      <span className={cn("leading-none", compact && "hidden sm:block")}>
        <span className={cn("block text-[19px] font-black tracking-[-0.055em] sm:text-[24px]", inverse ? "text-white" : "text-[color:var(--brand-green-deep)]")}>
          Variety<span className="text-brand-amber">Groceries</span>
        </span>
        <span className={cn("mt-1 hidden text-[10px] font-semibold tracking-wide sm:block", inverse ? "text-white/55" : "text-muted-foreground")}>
          Quality groceries. Brighter everyday living.
        </span>
      </span>
    </Link>
  );
}

export function StorefrontHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const lines = useCart((s) => s.lines);
  const itemCount = lines.reduce((a, l) => a + Number(l.quantity), 0);
  const pathCategory = pathname.startsWith("/categories/") ? pathname.split("/")[2] ?? "" : "";
  const selectedCategory = searchParams.get("category") ?? pathCategory;

  const isActive = (item: NavItem) => {
    if (item.href === "/shop") return pathname === "/shop" && !selectedCategory;
    if (item.category) {
      return (pathname === "/shop" && selectedCategory === item.category) || pathname === `/categories/${item.category}`;
    }
    const base = item.href.split("?")[0];
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  const submitSearch = () => {
    const trimmed = query.trim();
    router.push(trimmed ? `/shop?query=${encodeURIComponent(trimmed)}` : "/shop");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/95 shadow-[0_4px_24px_rgba(8,61,42,0.05)] backdrop-blur-xl">
      <div className="bg-[color:var(--brand-green-deep)] text-white">
        <div className="mx-auto flex min-h-8 max-w-[1500px] items-center justify-between gap-3 px-4 text-[11px] font-semibold sm:text-xs">
          <p className="truncate">Fresh groceries for Accra homes · delivery and collection available in this demo</p>
          <div className="hidden items-center gap-4 md:flex">
            <Link href="/track" className="inline-flex items-center gap-1.5 hover:underline"><Package className="size-3.5" /> Track order</Link>
            <Link href="/help" className="inline-flex items-center gap-1.5 hover:underline"><CircleHelp className="size-3.5" /> Help</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-3 sm:px-4">
        <div className="grid min-h-[72px] grid-cols-[auto_1fr_auto] items-center gap-2 py-2.5 lg:grid-cols-[auto_minmax(500px,1fr)_auto] lg:gap-5">
          <div className="flex items-center gap-1.5">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="size-10 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[310px] p-0">
                <SheetTitle className="border-b p-4"><Brand compact /></SheetTitle>
                <nav className="flex flex-col p-2" aria-label="Mobile navigation">
                  {NAV.map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("rounded-xl px-3 py-3 text-[15px] font-medium hover:bg-accent", isActive(item) && "bg-[color:var(--brand-green-deep)] font-bold text-white shadow-sm hover:bg-[color:var(--brand-green-deep)] hover:text-white")}>{item.label}</Link>
                  ))}
                  <div className="my-2 border-t" />
                  <Link href="/account" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-[15px] hover:bg-accent">My account</Link>
                  <Link href="/account/lists" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-[15px] hover:bg-accent">Saved lists</Link>
                  <Link href="/track" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-[15px] hover:bg-accent">Track an order</Link>
                </nav>
              </SheetContent>
            </Sheet>
            <Brand />
          </div>

          <form className="order-3 col-span-3 flex h-11 overflow-hidden rounded-xl border bg-white shadow-sm md:order-none md:col-span-1" role="search" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="hidden items-center gap-2 border-r bg-[#fbfbf7] px-3 text-xs font-bold text-foreground transition hover:bg-accent xl:flex" aria-label="Open all grocery categories">
                  All Categories <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 rounded-xl p-2 shadow-xl">
                <DropdownMenuLabel className="px-2 py-2 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Shop departments</DropdownMenuLabel>
                <DropdownMenuItem asChild className="rounded-lg p-0">
                  <Link href="/categories" className="flex w-full items-center justify-between px-3 py-2.5 font-bold text-primary">Browse all categories <ChevronDown className="size-3.5 -rotate-90" /></Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {CATEGORY_NAV.map((category) => (
                  <DropdownMenuItem key={category.slug} asChild className={cn("rounded-lg p-0", selectedCategory === category.slug && "bg-primary/10 text-primary")}>
                    <Link href={`/shop?category=${category.slug}`} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold">
                      {category.label}
                      {selectedCategory === category.slug ? <span className="size-2 rounded-full bg-brand-amber" aria-hidden /> : null}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:hidden" aria-hidden />
              <Input type="search" placeholder="Search for fresh groceries, products, brands…" className="h-full rounded-none border-0 pl-9 shadow-none focus-visible:ring-0 md:pl-4" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
            </div>
            <button type="submit" className="grid w-12 place-items-center bg-primary text-primary-foreground hover:bg-[color:var(--brand-green-deep)]" aria-label="Search"><Search className="size-4.5" /></button>
          </form>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
            <div className="hidden items-center gap-2 border-r pr-4 lg:flex">
              <MapPin className="size-5 text-primary" aria-hidden />
              <div className="text-[10px] leading-tight text-muted-foreground">Deliver to<br /><strong className="text-xs text-foreground">Accra, Ghana</strong></div>
            </div>
            <Link href="/account" className="hidden min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-foreground transition hover:bg-accent sm:flex" aria-label="Account">
              <UserRound className="size-5" aria-hidden /><span className="text-[10px] font-semibold">Account</span>
            </Link>
            <Link href="/account/lists" className="hidden min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-foreground transition hover:bg-accent md:flex" aria-label="Wishlist">
              <Heart className="size-5" aria-hidden /><span className="text-[10px] font-semibold">Wishlist</span>
            </Link>
            <Link href="/cart" className="relative flex min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-foreground transition hover:bg-accent sm:min-w-[58px]" aria-label={`Cart, ${itemCount} items`}>
              <span className="relative"><ShoppingCart className="size-5" aria-hidden />{itemCount > 0 ? <span className="absolute -right-3 -top-2 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-black text-white">{itemCount}</span> : null}</span>
              <span className="hidden text-[10px] font-semibold sm:block">Cart</span>
            </Link>
          </div>
        </div>

        <nav className="hidden h-10 items-center gap-1 overflow-x-auto border-t border-black/5 lg:flex" aria-label="Categories">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground",
                isActive(item) && "bg-[color:var(--brand-green-deep)] text-white shadow-sm ring-1 ring-brand-amber/35 hover:bg-[color:var(--brand-green-deep)] hover:text-white"
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

export function StorefrontMobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileQuery, setMobileQuery] = useState("");
  const lines = useCart((state) => state.lines);
  const itemCount = lines.reduce((total, line) => total + Number(line.quantity), 0);

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const mobileSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = mobileQuery.trim();
    setSearchOpen(false);
    router.push(query ? `/shop?query=${encodeURIComponent(query)}` : "/shop");
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-black/10 bg-white/95 px-1 pt-1 shadow-[0_-8px_30px_rgba(8,61,42,0.10)] backdrop-blur-xl pb-[max(.35rem,env(safe-area-inset-bottom))] md:hidden" aria-label="Mobile storefront navigation">
        <Link href="/" className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", active("/") ? "text-primary" : "text-muted-foreground")}><House className="size-5" aria-hidden />Home</Link>
        <Link href="/shop" className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", active("/shop") || pathname.startsWith("/categories") || pathname.startsWith("/products") ? "text-primary" : "text-muted-foreground")}><Store className="size-5" aria-hidden />Shop</Link>
        <button type="button" onClick={() => setSearchOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-muted-foreground" aria-label="Search groceries"><Search className="size-5" aria-hidden />Search</button>
        <Link href="/cart" className={cn("relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", active("/cart") ? "text-primary" : "text-muted-foreground")}><span className="relative"><ShoppingCart className="size-5" aria-hidden />{itemCount > 0 ? <span className="absolute -right-3 -top-2 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-black text-white">{itemCount}</span> : null}</span>Cart</Link>
        <Link href="/account" className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", active("/account") ? "text-primary" : "text-muted-foreground")}><UserRound className="size-5" aria-hidden />Account</Link>
      </nav>

      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 md:hidden">
          <SheetTitle className="text-lg">Search Variety Groceries</SheetTitle>
          <form onSubmit={mobileSearch} className="mt-3 flex h-12 overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input autoFocus type="search" value={mobileQuery} onChange={(event) => setMobileQuery(event.target.value)} placeholder="Search groceries, products, brands…" className="h-full border-0 pl-9 shadow-none focus-visible:ring-0" />
            </div>
            <Button type="submit" className="h-full rounded-none px-5">Search</Button>
          </form>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="justify-start"><Link href="/categories" onClick={() => setSearchOpen(false)}>Browse categories</Link></Button>
            <Button asChild variant="outline" className="justify-start"><Link href="/account/lists" onClick={() => setSearchOpen(false)}>Wishlist</Link></Button>
            <Button asChild variant="outline" className="justify-start"><Link href="/account/orders" onClick={() => setSearchOpen(false)}>My orders</Link></Button>
            <Button asChild variant="outline" className="justify-start"><Link href="/help" onClick={() => setSearchOpen(false)}>Help centre</Link></Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="storefront-footer-rich mt-auto bg-[color:var(--brand-green-deep)] text-white">
      <div className="mx-auto grid max-w-[1500px] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.9fr_.8fr_1.3fr]">
        <div className="space-y-4 sm:col-span-2 lg:col-span-1">
          <Brand compact inverse />
          <p className="max-w-xs text-sm leading-relaxed text-white/70">A connected grocery experience for everyday Ghanaian homes — fresh food, pantry staples, household essentials and order support in one place.</p>
          <p className="text-xs font-semibold text-brand-amber">Prices shown in Ghana cedis (₵).</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold">Shop</p>
          <ul className="space-y-2 text-xs text-white/70"><li><Link href="/shop">All products</Link></li><li><Link href="/shop?category=fresh-produce">Fresh produce</Link></li><li><Link href="/shop?category=dairy-eggs">Dairy & eggs</Link></li><li><Link href="/shop?category=meat-fish">Meat & fish</Link></li></ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold">Customer service</p>
          <ul className="space-y-2 text-xs text-white/70"><li><Link href="/track">Track your order</Link></li><li><Link href="/account/returns">Returns & refunds</Link></li><li><Link href="/help">Help centre</Link></li><li><Link href="/delivery">Delivery information</Link></li></ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold">About</p>
          <ul className="space-y-2 text-xs text-white/70"><li><Link href="/privacy">Privacy</Link></li><li><Link href="/terms">Terms</Link></li><li><Link href="/returns-policy">Returns policy</Link></li><li><Link href="/assistant">Shopping assistant</Link></li></ul>
        </div>
        <div>
          <p className="text-sm font-bold">Stay connected</p>
          <p className="mt-1 text-xs leading-relaxed text-white/65">Use your account for order history and repeat shopping. Public notification channels remain demo-only until launch configuration is complete.</p>
          <div className="mt-4 flex gap-2"><Button asChild variant="secondary" className="h-10"><Link href="/account">My account</Link></Button><Button asChild className="h-10 bg-brand-amber text-[color:var(--brand-green-deep)] hover:bg-brand-amber/90"><Link href="/shop">Shop now</Link></Button></div>
        </div>
      </div>
      <div className="border-t border-white/10"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-white/55"><p>© {new Date().getFullYear()} Variety Groceries · Ghana · Demo storefront</p><p>Mobile Money · Card · Bank transfer · Cash — provider connections remain clearly labelled in the checkout.</p></div></div>
    </footer>
  );
}
