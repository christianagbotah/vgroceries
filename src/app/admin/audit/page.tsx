"use client";

import { useState } from "react";
import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { Input } from "@/components/ui/input";
import { ScrollText, Search } from "lucide-react";

type AuditRow = Awaited<ReturnType<typeof apiOps.auditEvents>>[number];

export default function AdminAuditPage() {
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApiData(() => apiOps.auditEvents(q || undefined), [q]);

  if (loading) return <LoadingState rows={6} label="Loading audit events" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Actor, timestamp, entity, reason and before/after values. Production logging must avoid
          secrets and unnecessary personal information.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" className="h-11 pl-9" placeholder="Action, entity or actor…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit events" />
      </div>

      {!rows.length ? (
        <EmptyState icon={ScrollText} title="No audit events match" />
      ) : (
        <ol className="space-y-2">
          {rows.map((e: AuditRow) => (
            <li key={e.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-primary">{e.action}</span>
                <span className="text-xs text-muted-foreground">{e.atLabel} UTC · {e.actorName}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                <span className="font-mono text-xs">{e.entity}</span> · <span className="font-mono text-xs">{e.entityId}</span>
                {e.reason ? ` · reason: ${e.reason}` : ""}
              </p>
              {e.before !== undefined || e.after !== undefined ? (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {e.before !== undefined ? `before: ${e.before} ` : ""}
                  {e.after !== undefined ? `after: ${e.after}` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
