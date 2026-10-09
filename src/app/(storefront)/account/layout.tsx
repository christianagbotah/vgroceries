"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { User, Package, MapPin, Heart, RotateCcw } from "lucide-react";

const TABS = [
  { href: "/account", label: "Overview", icon: User },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/lists", label: "Lists", icon: Heart },
  { href: "/account/returns", label: "Returns", icon: RotateCcw },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">My account</h1>
        <p className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
          Demo account area — one fictional customer is signed in
        </p>
      </div>
      <nav aria-label="Account sections" className="mt-4 flex gap-1 overflow-x-auto border-b pb-px">
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href !== "/account" && pathname.startsWith(t.href));
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium hover:bg-accent",
                active ? "border border-b-0 border-border bg-accent text-primary" : "text-muted-foreground"
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4">{children}</div>
    </div>
  );
}
