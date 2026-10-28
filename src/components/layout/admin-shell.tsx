"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiOps } from "@/services/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaff, DEMO_ROLE_OPTIONS } from "@/features/staff/role-context";
import { clearDemoStaffSession, isDemoStaffSessionActive } from "@/features/staff/staff-demo-session";
import { ROLE_LABELS } from "@/types/domain";
import type { Permission } from "@/lib/perms";
import { LayoutDashboard, Menu, ShoppingCart, Store, Boxes, Package, ClipboardList, Truck, Users, RotateCcw, CreditCard, UserRound, BarChart3, Sparkles, ShieldCheck, ScrollText, Settings2, FlaskConical, LogOut, Warehouse, ClipboardCheck, TriangleAlert, ReceiptText, Landmark, Network, FileText, Home, ExternalLink } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  permission: Permission;
  icon: typeof LayoutDashboard;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", permission: "orders.view", icon: LayoutDashboard },
    ],
  },
  {
    title: "Selling",
    items: [
      { href: "/admin/orders", label: "Orders", permission: "orders.view", icon: ShoppingCart },
      { href: "/admin/fulfilment", label: "Fulfilment", permission: "orders.view", icon: Package },
      { href: "/admin/pos", label: "Counter sales (POS)", permission: "pos.use", icon: Store },
      { href: "/admin/cashier-sessions", label: "Cashier sessions", permission: "cash.session.manage", icon: ReceiptText },
    ],
  },
  {
    title: "Storefront CMS",
    items: [
      { href: "/admin/content", label: "Content studio", permission: "settings.manage", icon: FileText },
      { href: "/admin/content/homepage", label: "Homepage", permission: "settings.manage", icon: Home },
    ],
  },
  {
    title: "Catalogue & stock",
    items: [
      { href: "/admin/products", label: "Products", permission: "catalog.view", icon: Boxes },
      { href: "/admin/categories", label: "Categories", permission: "catalog.view", icon: ClipboardList },
      { href: "/admin/inventory", label: "Stock overview", permission: "inventory.view", icon: Warehouse },
      { href: "/admin/inventory/receiving", label: "Goods receiving", permission: "inventory.receive", icon: ClipboardCheck },
      { href: "/admin/inventory/adjustments", label: "Adjustments", permission: "inventory.view", icon: TriangleAlert },
      { href: "/admin/inventory/stocktakes", label: "Stocktakes", permission: "inventory.view", icon: ClipboardList },
      { href: "/admin/inventory/expiry", label: "Expiry & quarantine", permission: "inventory.view", icon: TriangleAlert },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { href: "/admin/suppliers", label: "Suppliers", permission: "purchasing.manage", icon: Landmark },
      { href: "/admin/purchases", label: "Purchase orders", permission: "purchasing.manage", icon: Boxes },
    ],
  },
  {
    title: "Delivery",
    items: [
      { href: "/admin/logistics", label: "Logistics & Delivery", permission: "logistics.manage", icon: Network },
      { href: "/admin/dispatch", label: "Dispatch", permission: "dispatch.view", icon: Truck },
      { href: "/admin/riders", label: "Riders", permission: "riders.manage", icon: Users },
      { href: "/admin/providers", label: "Providers", permission: "dispatch.view", icon: Landmark },
    ],
  },
  {
    title: "Service",
    items: [
      { href: "/admin/returns", label: "Returns", permission: "returns.view", icon: RotateCcw },
      { href: "/admin/refunds", label: "Refunds", permission: "refunds.view", icon: CreditCard },
      { href: "/admin/customers", label: "Customers", permission: "customers.view", icon: UserRound },
      { href: "/admin/payments", label: "Payments", permission: "payments.view", icon: CreditCard },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/admin/reports", label: "Reports", permission: "reports.view", icon: BarChart3 },
      { href: "/admin/ai", label: "AI assistant", permission: "ai.view", icon: Sparkles },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/team", label: "Team & roles", permission: "team.manage", icon: ShieldCheck },
      { href: "/admin/audit", label: "Audit log", permission: "audit.view", icon: ScrollText },
      { href: "/admin/settings", label: "Settings", permission: "settings.manage", icon: Settings2 },
      { href: "/admin/demo", label: "Demo controls", permission: "demo.controls", icon: FlaskConical },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, setRole, can } = useStaff();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [demoSessionActive, setDemoSessionActive] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDemoSessionActive(isDemoStaffSessionActive()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const signOut = async () => {
    setLoggingOut(true);
    try {
      if (isDemoStaffSessionActive()) clearDemoStaffSession();
      else await apiOps.staffLogout();
      router.replace("/staff/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  // The most specific matching nav item wins, so nested routes (e.g.
  // /admin/inventory/receiving) highlight exactly one item — the parent
  // "Stock overview" never lights up alongside its children.
  const navItems = GROUPS.flatMap((g) => g.items);
  const activeItem = navItems
    .filter((i) => (i.href === "/admin" ? pathname === "/admin" : pathname === i.href || pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const isActive = (href: string) => activeItem?.href === href;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-sidebar-border p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary font-serif text-lg font-bold text-sidebar-primary-foreground" aria-hidden>
          V
        </span>
        <div className="leading-tight">
          <p className="font-serif font-bold text-sidebar-foreground">Variety Groceries</p>
          <p className="text-[11px] text-sidebar-foreground/70">{demoSessionActive ? "Back office · demo" : "Back office"}</p>
        </div>
      </div>

      <nav className="scroll-soft flex-1 overflow-y-auto p-2" aria-label="Admin navigation">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => can(i.permission));
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-3">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                {g.title}
              </p>
              <ul>
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent",
                        isActive(item.href) && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="px-3 py-2 text-[11px] text-sidebar-foreground/50">
          Menus are role-filtered UX only — the backend must enforce access.
        </p>
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-sidebar text-sidebar-foreground lg:block" aria-label="Admin sidebar">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open admin menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Admin navigation</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{activeItem?.label ?? "Back office"}</p>
            <p className="truncate text-xs text-muted-foreground">varietygrocery.com operations</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="hidden h-10 lg:inline-flex">
              <Link href="/" target="_blank"><ExternalLink className="size-4" aria-hidden /> View storefront</Link>
            </Button>
            {demoSessionActive ? (
              <>
                <span className="hidden rounded-full border border-dashed px-2.5 py-1 text-[11px] text-muted-foreground xl:inline">
                  Demo mode · mock data only
                </span>
                <label className="sr-only" htmlFor="role-select">Acting role</label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger id="role-select" className="h-10 w-[190px] sm:w-[230px]" aria-label="Acting demo role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEMO_ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.user.name} — {ROLE_LABELS[o.value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
            <Button variant="ghost" size="icon" className="size-10" aria-label="Sign out of staff area" onClick={signOut} disabled={loggingOut}>
              <LogOut className="size-5" aria-hidden />
            </Button>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
