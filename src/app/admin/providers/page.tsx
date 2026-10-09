"use client";

import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Landmark } from "lucide-react";

type Provider = Awaited<ReturnType<typeof apiOps.providers>>[number];

export default function AdminProvidersPage() {
  const { data, loading, error, reload } = useApiData(() => apiOps.providers(), []);

  if (loading) return <LoadingState rows={3} label="Loading providers" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Delivery providers</h1>
        <p className="text-sm text-muted-foreground">
          The provider adapter defines quote, book, cancel, status, webhook and proof-of-delivery
          capabilities. No third-party courier is integrated — coverage, commercial terms and
          technical access are checked by the owner first.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {data.map((p: Provider) => (
          <article key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="size-5 text-primary" aria-hidden />
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {p.isConfigured ? "In-house — managed in this dashboard" : "External — candidate adapter"}
                  </p>
                </div>
              </div>
              <StatusBadge kind="generic" status={p.isConfigured ? "configured" : "not_connected"} label={p.isConfigured ? "Configured" : "Not connected"} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.capabilities.map((c) => (
                <Badge key={c} variant="secondary" className="font-mono text-[11px]">{c}</Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{p.notes}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <h2 className="mb-1 font-semibold text-foreground">What the future integration looks like</h2>
        <p>
          The service boundary exposes <span className="font-mono text-xs">quote · book · cancel · status · webhook · proof_of_delivery</span>.
          A real adapter implements those operations against the chosen provider; manual booking
          stays available as the fallback when a provider lacks an integration. Until the owner
          selects and verifies providers, every external adapter stays “Not connected”.
        </p>
      </div>
    </div>
  );
}
