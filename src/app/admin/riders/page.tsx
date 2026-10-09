"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { relativeTime } from "@/lib/format";
import { Bike, Users, MapPin } from "lucide-react";

type Rider = Awaited<ReturnType<typeof apiOps.riders>>[number];

export default function AdminRidersPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.riders(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (r: Rider, available: boolean) => {
    setBusy(r.id);
    try {
      await apiOps.riderToggle(r.id, available, user.id);
      await reload();
      toast({ title: `${r.name} marked ${available ? "available" : "unavailable"}` });
    } catch (e) {
      toast({ title: "Could not update rider", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading riders" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const inHouse = data.filter((r) => r.kind === "in_house");
  const contracted = data.filter((r) => r.kind === "contracted");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Riders</h1>
        <p className="text-sm text-muted-foreground">
          In-house riders, contracted riders, availability and pending remittance. Riders only ever
          see their own assigned customers.
        </p>
      </div>

      {[
        { title: "In-house", icon: Bike, rows: inHouse },
        { title: "Contracted", icon: Users, rows: contracted },
      ].map((group) => (
        <section key={group.title} aria-labelledby={`riders-${group.title}`} className="overflow-hidden rounded-xl border bg-card">
          <h2 id={`riders-${group.title}`} className="flex items-center gap-2 border-b p-4 font-semibold">
            <group.icon className="size-5 text-primary" aria-hidden /> {group.title} riders ({group.rows.length})
          </h2>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-semibold">Rider</th>
                  <th className="p-3 font-semibold">Zones</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="hidden p-3 font-semibold md:table-cell">Last location</th>
                  <th className="p-3 text-right font-semibold">Unremitted</th>
                  <th className="p-3 text-right font-semibold">Availability</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">
                      <p className="font-medium">{r.name} {r.isDemo ? <span className="text-xs text-muted-foreground">(demo)</span> : null}</p>
                      <p className="text-xs text-muted-foreground">{r.phone} · {r.vehicle}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{r.zoneNames}</td>
                    <td className="p-3">
                      {r.isAvailable ? (
                        <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Available</span>
                      ) : r.activeJobId ? (
                        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">On a job</span>
                      ) : (
                        <span className="rounded-full border px-2 py-0.5 text-xs font-semibold text-muted-foreground">Off duty</span>
                      )}
                    </td>
                    <td className="hidden p-3 md:table-cell">
                      {r.lastLocationLabel ? (
                        <p className="text-xs text-muted-foreground">
                          <MapPin className="mr-1 inline size-3" aria-hidden />
                          {r.lastLocationLabel} · {r.lastLocationAt ? relativeTime(r.lastLocationAt) : ""}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not shared</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">{r.pendingRemittanceLabel}</td>
                    <td className="p-3 text-right">
                      {can("riders.manage") ? (
                        <Button
                          size="sm"
                          variant={r.isAvailable ? "outline" : "secondary"}
                          className="h-9"
                          disabled={busy === r.id || !!r.activeJobId}
                          onClick={() => toggle(r, !r.isAvailable)}
                        >
                          {r.activeJobId ? "On a job" : r.isAvailable ? "Mark off" : "Mark available"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        Location labels are demo values with their last update time shown — tracking is optional,
        permission-based, and never assumed. Riders log in at{" "}
        <span className="font-mono text-xs">/rider/login</span>.
      </p>
    </div>
  );
}
