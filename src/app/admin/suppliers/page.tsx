"use client";

import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Landmark, Phone, Mail } from "lucide-react";

type SupplierRow = Awaited<ReturnType<typeof apiOps.suppliers>>[number];

export default function AdminSuppliersPage() {
  const { data, loading, error, reload } = useApiData(() => apiOps.suppliers(), []);

  if (loading) return <LoadingState rows={4} label="Loading suppliers" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState icon={Landmark} title="No suppliers" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Suppliers</h1>
        <p className="text-sm text-muted-foreground">
          Demo supplier records with purchase-order activity. All contact details are fictional.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.map((s: SupplierRow) => (
          <article key={s.id} className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="size-5 text-primary" aria-hidden />
                <h2 className="font-semibold">{s.name}</h2>
              </div>
              <Badge variant={s.isActive ? "secondary" : "outline"}>{s.isActive ? "active" : "inactive"}</Badge>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {s.phone ? <p className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden /> {s.phone}</p> : null}
              {s.email ? <p className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden /> {s.email}</p> : null}
            </div>
            <p className="text-sm text-muted-foreground">{s.notes}</p>
            <p className="text-xs text-muted-foreground">
              {s.poCount} purchase order(s) · {s.openPoCount} open
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
