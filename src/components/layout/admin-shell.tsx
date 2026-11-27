"use client";

import Link from "next/link";
import Image from "next/image";
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
import { LayoutDashboard, Menu, ShoppingCart, Store, Boxes, Package, ClipboardList, Truck, Users, RotateCcw, CreditCard, UserRound, BarChart3, Sparkles, ShieldCheck, ScrollText, Settings2, FlaskConical, LogOut, Warehouse, ClipboardCheck, TriangleAlert, ReceiptText, Landmark, Network, FileText, Home, ExternalLink, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
      ...(process.env.NEXT_PUBLIC_INTERNAL_TRANSFERS_UAT === "1" ? [
        { href: "/admin/inventory/transfers", label: "Branch transfers", permission: "inventory.view" as const, icon: Truck },
      ] : []),
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
      { href: "/admin/dispatch/cod-exceptions", label: "COD exceptions", permission: "dispatch.view", icon: TriangleAlert },
      { href: "/admin/riders", label: "Riders", permission: "riders.manage", icon: Users },
      { href: "/admin/providers", label: "Providers", permission: "dispatch.view", icon: Landmark },
    ],
  },
  {
    title: "Service",
    items: [
      { href: "/admin/returns", label: "Returns", permission: "returns.view", icon: RotateCcw },
      { href: "/admin/physical-returns", label: "Physical intake", permission: "returns.view", icon: ClipboardCheck },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [demoSessionActive, setDemoSessionActive] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDemoSessionActive(isDemoStaffSessionActive()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setSidebarCollapsed(window.localStorage.getItem("vg-admin-sidebar-collapsed") === "true");
      } catch {
        // Sidebar remains usable when browser storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      window.localStorage.setItem("vg-admin-sidebar-collapsed", String(next));
    } catch {
      // Preference is optional; the toggle still works.
    }
  };

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

  const sidebar = (compact = false) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 border-b border-sidebar-border px-3 py-3", compact && "justify-center px-1")}>
        <Image src="/brand/variety-mark.svg" alt="Variety Groceries" width={36} height={38} className="h-9 w-9 shrink-0 object-contain" />
        {!compact && (
          <div className="min-w-0 leading-tight">
            <p className="truncate font-serif text-sm font-bold text-sidebar-foreground">Variety Groceries</p>
            <p className="text-[11px] text-sidebar-foreground/70">{demoSessionActive ? "Back office · demo" : "Back office"}</p>
          </div>
        )}
      </div>

      <nav className={cn("scroll-soft min-h-0 flex-1 overflow-y-auto p-2", compact && "px-1")} aria-label="Admin navigation">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => can(i.permission));
          if (!items.length) return null;
          return (
            <div key={g.title} className={cn("mb-3", compact && "border-t border-sidebar-border pt-2 first:border-t-0")}>
              <p className={cn("px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60", compact && "sr-only")}>
                {g.title}
              </p>
              <ul>
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      aria-label={compact ? item.label : undefined}
                      title={compact ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent",
                        compact && "justify-center px-2",
                        isActive(item.href) && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className={cn("truncate", compact && "sr-only")}>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!compact && (
          <p className="px-3 py-2 text-[11px] text-sidebar-foreground/50">
            Menus are role-filtered UX only — the backend must enforce access.
          </p>
        )}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:block",
          sidebarCollapsed ? "w-16" : "w-56"
        )}
        aria-label="Admin sidebar"
      >
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">{sidebar(sidebarCollapsed)}</div>
          <div className={cn("shrink-0 border-t border-sidebar-border p-2", sidebarCollapsed ? "flex justify-center" : "flex justify-end")}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <>
                  <PanelLeftClose className="size-4" aria-hidden />
                  <span className="text-xs">Collapse</span>
                </>
              )}
            </Button>
          </div>
        </div>
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
            <SheetContent side="left" className="w-64 max-w-[85vw] border-0 bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Admin navigation</SheetTitle>
              {sidebar(false)}
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
        {demoSessionActive ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span><strong>DEMO MODE — sample data only.</strong> Real customer orders and payments are not shown here.</span><Button asChild size="sm" variant="outline"><Link href={`/staff/login?live=1&next=${encodeURIComponent(pathname)}`}>Switch to live staff sign-in</Link></Button></div> : null}

        <main id="main" className="min-w-0 flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
