"use client";

import { apiOps } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { PERMISSIONS } from "@/lib/perms";
import { ROLE_LABELS } from "@/types/domain";
import type { StaffRole } from "@/types/domain";
import { ShieldCheck } from "lucide-react";

type TeamRow = Awaited<ReturnType<typeof apiOps.team>>[number];

export default function AdminTeamPage() {
  const { data, loading, error, reload } = useApiData(() => apiOps.team(), []);

  if (loading) return <LoadingState rows={4} label="Loading team" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const team = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Team &amp; roles</h1>
        <p className="text-sm text-muted-foreground">
          Fictional demo identities. Role menus and action gating are UX only — the backend must
          enforce access on every protected operation.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Member</th>
                <th className="p-3 font-semibold">Role</th>
                <th className="hidden p-3 font-semibold md:table-cell">Phone</th>
                <th className="hidden p-3 font-semibold sm:table-cell">Open sessions</th>
                <th className="p-3 text-right font-semibold">Demo identity</th>
              </tr>
            </thead>
            <tbody>
              {team.map((m: TeamRow) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="p-3">{ROLE_LABELS[m.role]}</td>
                  <td className="hidden p-3 text-muted-foreground md:table-cell">{m.phone}</td>
                  <td className="hidden p-3 tabular-nums text-muted-foreground sm:table-cell">{m.openSessions}</td>
                  <td className="p-3 text-right">
                    <Badge variant="outline" className="text-xs">demo</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section aria-labelledby="perm-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="perm-heading" className="flex items-center gap-2 border-b p-4 font-semibold">
          <ShieldCheck className="size-5 text-primary" aria-hidden /> Permission matrix (summary)
        </h2>
        <div className="table-scroll">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Permission</th>
                {(Object.keys(ROLE_LABELS) as StaffRole[]).filter((r) => r !== "rider").map((r) => (
                  <th key={r} className="p-3 font-semibold">{ROLE_LABELS[r].split(" / ")[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSIONS).map(([permission, roles]) => (
                <tr key={permission} className="border-t">
                  <td className="p-3 font-mono">{permission}</td>
                  {(Object.keys(ROLE_LABELS) as StaffRole[]).filter((r) => r !== "rider").map((r) => (
                    <td key={r} className="p-3 text-center">
                      {roles.includes(r) ? (
                        <span className="font-bold text-success" title="allowed">✓</span>
                      ) : (
                        <span className="text-muted-foreground" title="not allowed">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t p-4 text-xs text-muted-foreground">
          A demo role selector is available in demo mode only and excluded from production. Full
          details in docs/PERMISSIONS.md.
        </p>
      </section>
    </div>
  );
}
