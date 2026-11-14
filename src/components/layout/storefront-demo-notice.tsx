"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { clearDemoCustomerSession, isDemoCustomerSessionActive } from "@/features/staff/staff-demo-session";

/** A clear distinction between a public genuine storefront and mock customer UAT. */
export function StorefrontDemoNotice() {
  const pathname = usePathname();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const active = isDemoCustomerSessionActive();
      if (active && !pathname.startsWith("/account")) {
        // Account previews use synthetic customer IDs and mock catalogue IDs.
        // Leaving the preview must return to the original real shop rather
        // than mixing fake cart variants with genuine available-to-sell stock.
        clearDemoCustomerSession();
        window.location.replace(window.location.href);
        return;
      }
      setDemo(active);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  if (!demo) return null;
  return (
    <div role="status" className="border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
          <span><strong>Customer demo account:</strong> profile, orders and returns are sample data. Leaving the account returns to live guest shopping.</span>
        </span>
        <Link href="/" onClick={() => { clearDemoCustomerSession(); setDemo(false); }}
          className="font-semibold text-primary underline underline-offset-2 hover:no-underline">
          Exit demo and browse real groceries
        </Link>
      </div>
    </div>
  );
}
