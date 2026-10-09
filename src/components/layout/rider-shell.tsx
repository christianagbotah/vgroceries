"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bike, ClipboardList, LogOut, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

const RIDER_KEY = "vg-rider-id-v1";

export function useRiderSession() {
  const [riderId, setRiderId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // hydrate from browser storage after mount (setState inside a callback, not synchronously)
    const id = window.setTimeout(() => {
      const saved = localStorage.getItem(RIDER_KEY);
      setRiderId(saved);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const setRider = (id: string) => {
    setRiderId(id);
    localStorage.setItem(RIDER_KEY, id);
  };
  const clearRider = () => {
    setRiderId(null);
    localStorage.removeItem(RIDER_KEY);
  };
  return { riderId, setRider, clearRider, ready };
}

export function RiderShell({ children, riderName }: { children: React.ReactNode; riderName?: string }) {
  const pathname = usePathname();
  const { clearRider } = useRiderSession();

  const nav = [
    { href: "/rider", label: "Today", icon: MapPin },
    { href: "/rider/history", label: "History", icon: ClipboardList },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary font-serif text-lg font-bold text-sidebar-primary-foreground" aria-hidden>
            V
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-bold">Variety Groceries · Rider</p>
            {riderName ? <p className="truncate text-xs opacity-80">{riderName}</p> : null}
          </div>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-10 text-primary-foreground hover:bg-primary-foreground/10"
            aria-label="Sign out of rider workspace"
          >
            <Link href="/rider/login" onClick={() => clearRider()}>
              <LogOut className="size-5" aria-hidden />
            </Link>
          </Button>
        </div>
        <nav className="mx-auto flex max-w-xl gap-1 px-2 pb-1.5" aria-label="Rider navigation">
          {nav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                  active ? "bg-primary-foreground/15" : "hover:bg-primary-foreground/10"
                )}
              >
                <n.icon className="size-4" aria-hidden /> {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-4 pb-24">
        {children}
      </main>
      <p className="mx-auto max-w-xl px-4 pb-6 text-center text-xs text-muted-foreground">
        <Bike className="mr-1 inline size-3.5" aria-hidden />
        Rider workspace · demo · assigned customers only
      </p>
    </div>
  );
}
