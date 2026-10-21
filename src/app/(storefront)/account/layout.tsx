"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { apiOps, ApiError } from "@/services/client";
import type { SessionLookupResponse } from "@/services/contracts";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { User, Package, Heart, LogOut } from "lucide-react";

const TABS = [
  { href: "/account", label: "Overview", icon: User },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/lists", label: "Wishlist", icon: Heart },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/account/login";
  const [session, setSession] = useState<SessionLookupResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;
    apiOps.authMe().then((result) => {
      if (cancelled) return;
      if (result.actor.role !== "customer") {
        router.replace("/account/login");
        return;
      }
      setSession(result);
    }).catch((error) => {
      if (cancelled) return;
      if (error instanceof ApiError && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.code)) {
        router.replace("/account/login");
        return;
      }
      setAuthError(error instanceof ApiError ? error.message : "Could not verify your account session.");
    });
    return () => { cancelled = true; };
  }, [isLogin, router]);

  const logout = async () => {
    if (!session) return;
    setLoggingOut(true);
    try {
      await apiOps.accountLogout(session.csrfToken);
    } finally {
      router.replace("/");
      router.refresh();
      setLoggingOut(false);
    }
  };

  if (isLogin) return <>{children}</>;
  if (authError) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorState message={authError} /></div>;
  if (!session) return <div className="mx-auto max-w-3xl px-4 py-10"><LoadingState rows={3} label="Checking account session" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-serif text-2xl font-bold sm:text-3xl">My account</h1><p className="mt-1 text-sm text-muted-foreground">Welcome, {session.actor.name}. View your orders and wishlist in one place.</p></div>
        <Button variant="outline" className="h-10 gap-2" onClick={logout} disabled={loggingOut}><LogOut className="size-4" aria-hidden /> {loggingOut ? "Logging out…" : "Log out"}</Button>
      </div>
      <nav aria-label="Account sections" className="mt-5 flex gap-1 overflow-x-auto border-b pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const active = pathname === tab.href || (tab.href !== "/account" && pathname.startsWith(tab.href));
          return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium transition hover:bg-accent", active ? "border border-b-0 border-border bg-accent text-primary" : "text-muted-foreground")}><tab.icon className="size-4" aria-hidden />{tab.label}</Link>;
        })}
      </nav>
      <div className="mt-4">{children}</div>
    </div>
  );
}
