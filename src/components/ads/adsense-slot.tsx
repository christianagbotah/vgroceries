"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

function validClient(value?: string): value is string {
  return Boolean(value && /^ca-pub-\d{16}$/.test(value));
}

function validSlot(value?: string): value is string {
  return Boolean(value && /^\d{5,20}$/.test(value));
}

export function AdSenseSlot({
  slot,
  className,
  label = "Advertisement",
}: {
  slot?: string;
  className?: string;
  label?: string;
}) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
  const enabled = validClient(client) && validSlot(slot);
  const pushed = useRef(false);

  useEffect(() => {
    if (!enabled || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      pushed.current = false;
    }
  }, [enabled, slot]);

  if (!enabled) return null;

  return (
    <aside className={cn("my-6 overflow-hidden rounded-2xl border bg-white px-3 py-3 shadow-sm", className)} aria-label={label}>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <ins
        className="adsbygoogle block min-h-[90px] w-full"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
