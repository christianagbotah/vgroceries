"use client";

import { useEffect, useState } from "react";
import { apiOps, ApiError, type AwaitedOrder } from "@/services/account-types";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AccountAddressesPage() {
  const [data, setData] = useState<AwaitedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await apiOps.accountSummary());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load your addresses.");
      }
    })();
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState rows={3} label="Loading addresses" />;

  if (!data.addresses.length) {
    return (
      <EmptyState
        icon={MapPin}
        title="No saved addresses"
        description="Addresses entered at checkout are saved here for next time (demo behaviour)."
        action={{ label: "Shop now", href: "/shop" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {data.addresses.map((a) => (
          <div key={a.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{a.label}</p>
              {a.isDefault ? <Badge variant="secondary">Default</Badge> : null}
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>{a.recipientName} · {a.phone}</p>
              <p>{a.street}</p>
              <p>{a.locality}{a.ghanaPostGps ? ` · GPS: ${a.ghanaPostGps}` : ""}</p>
              {a.landmark ? <p className="text-xs">Landmark: {a.landmark}</p> : null}
            </div>
          </div>
        ))}
      </div>
      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        Address editing arrives with the backend accounts service. For now, new addresses can be
        entered at{" "}
        <Link href="/checkout" className="text-primary underline hover:no-underline">
          checkout
        </Link>
        .
      </p>
      <Button asChild variant="outline" className="h-11">
        <Link href="/account">Back to account</Link>
      </Button>
    </div>
  );
}
