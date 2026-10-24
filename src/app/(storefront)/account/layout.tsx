"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { User, UserRound, Package, MapPin, Heart, RotateCcw, LogOut } from "lucide-react";

const TABS = [
  { href: "/account", label: "Overview", icon: User },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/lists", label: "Wishlist", icon: Heart },
  { href: "/account/returns", label: "Returns", icon: RotateCcw },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authPage = pathname === "/account/login" || pathname === "/account/signup";
  const [checking, setChecking] = useState(!authPage);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (authPage) { setChecking(false); setSessionError(null); return; }
    let active = true;
    setChecking(true);
    apiOps.accountSession().then((session) => {
      if (!active) return;
      if (session.actor.role !== "customer") {
        router.replace("/account/login");
        return;
      }
      setSessionError(null);
      setChecking(false);
    }).catch((e) => {
      if (!active) return;
      if (e instanceof ApiError && (e.code === "UNAUTHENTICATED" || e.code === "FORBIDDEN")) {
        router.replace("/account/login");
        return;
      }
      setSessionError(e instanceof ApiError ? e.message : "Could not verify your account session.");
      setChecking(false);
    });
    return () => { active = false; };
  }, [authPage, pathname, router]);

  const logout = async () => {
    setLoggingOut(true);
    try { await apiOps.accountLogout(); }
    finally {
      router.replace("/account/login");
      router.refresh();
      setLoggingOut(false);
    }
  };

  if (authPage) return children;
  if (checking) return <div className="mx-auto max-w-5xl px-4 py-10"><LoadingState rows={3} label="Checking account session" /></div>;
  if (sessionError) return <div className="mx-auto max-w-5xl px-4 py-10"><ErrorState message={sessionError} /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">My account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your profile, orders, addresses, wishlist and returns in one place.</p>
        </div>
        <Button variant="outline" className="h-10 gap-2" onClick={logout} disabled={loggingOut}>
          <LogOut className="size-4" aria-hidden /> {loggingOut ? "Logging out…" : "Log out"}
        </Button>
      </div>

      <nav aria-label="Account sections" className="mt-5 flex gap-1 overflow-x-auto border-b pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href !== "/account" && pathname.startsWith(t.href));
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium transition hover:bg-accent", active ? "border border-b-0 border-border bg-accent text-primary" : "text-muted-foreground")}>
              <t.icon className="size-4" aria-hidden />{t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4">{children}</div>
    </div>
  );
}
