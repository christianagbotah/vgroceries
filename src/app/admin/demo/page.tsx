"use client";

import { useEffect, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, RotateCcw, Zap, WifiOff, Timer, CopyPlus, Banknote, Ban } from "lucide-react";

interface Flags { latencyMs: number; forcePaymentFailure: boolean; offlineMode: boolean }

const LATENCY_OPTIONS = [0, 800, 2000, 3500];

export default function AdminDemoPage() {
  const { can } = useStaff();
  const { toast } = useToast();
  const [flags, setFlags] = useState<Flags | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = async () => {
    try {
      setFlags((await apiOps.demoFlags({})) as Flags);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load demo flags.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setFlag = async (patch: Partial<Flags>) => {
    setBusy("flags");
    try {
      setFlags((await apiOps.demoFlags(patch)) as Flags);
    } catch (e) {
      toast({ title: "Flag not set", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      const r = await apiOps.demoReset();
      setLastResult(`Fixtures reseeded at ${r.seededAt}.`);
      toast({ title: "Demo data reset", description: "All fixtures back to their seeded state." });
      await load();
    } catch (e) {
      toast({ title: "Reset failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const scenario = async (name: string) => {
    setBusy(name);
    try {
      const r = await apiOps.demoScenario(name);
      setLastResult(JSON.stringify(r, null, 2));
      toast({ title: `Scenario “${name}” applied` });
    } catch (e) {
      toast({ title: "Scenario failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!flags) return <LoadingState rows={3} label="Loading demo controls" />;

  const scenarios = [
    { key: "expire_reservations", label: "Expire active reservations now", copy: "Releases unconsumed holds — checkout timers visibly run out.", icon: Timer },
    { key: "reserve_last_unit", label: "Reserve the last Frozen Chicken online", copy: "Then try adding it at the POS — a clear out-of-stock conflict.", icon: Zap },
    { key: "duplicate_callback", label: "Fire a duplicate payment callback", copy: "Extra callback on a pending payment; state must not change.", icon: CopyPlus },
    { key: "payment_failure", label: "Toggle forced payment failure", copy: "Next “approved” payments fail at the provider (demo).", icon: Ban },
    { key: "seed_pending_payment", label: "Create a pending-payment order", copy: "Adds a fresh online order with Mobile Money pending.", icon: Banknote },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Demo controls</h1>
        <p className="text-sm text-muted-foreground">
          Technical controls kept out of customer flows. Simulate shortages, slow responses, expired
          reservations, duplicate callbacks and payment failures. Demo-mode only — excluded from
          production.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="size-5 text-primary" aria-hidden /> Reset fixtures
          </CardTitle>
          <CardDescription>Reseed the entire mock store (products, orders, jobs, returns…).</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="h-11" onClick={reset} disabled={busy !== null}>
            {busy === "reset" ? "Resetting…" : "Reset all demo data"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Single-process dev server: state also resets on server restart. Browser cart (localStorage)
            is preserved.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failure & latency simulation</CardTitle>
          <CardDescription>Operations report honestly what actually happened.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="dm-offline" className="text-sm font-medium flex items-center gap-1.5"><WifiOff className="size-4" aria-hidden /> Offline mode</Label>
              <p className="text-xs text-muted-foreground">All non-demo operations return a real 503 — screens show error states.</p>
            </div>
            <Switch id="dm-offline" checked={flags.offlineMode} onCheckedChange={(v) => setFlag({ offlineMode: v })} disabled={busy !== null} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="dm-fail" className="text-sm font-medium">Force payment failure</Label>
              <p className="text-xs text-muted-foreground">Approved payments fail at the provider on the next attempt.</p>
            </div>
            <Switch id="dm-fail" checked={flags.forcePaymentFailure} onCheckedChange={(v) => setFlag({ forcePaymentFailure: v })} disabled={busy !== null} />
          </div>
          <div className="rounded-lg border p-3">
            <Label className="text-sm font-medium">Response latency</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {LATENCY_OPTIONS.map((ms) => (
                <Button
                  key={ms}
                  size="sm"
                  variant={flags.latencyMs === ms ? "default" : "outline"}
                  className="h-9"
                  disabled={busy !== null}
                  onClick={() => setFlag({ latencyMs: ms })}
                >
                  {ms === 0 ? "No delay" : `${ms} ms`}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Watch the loading skeletons and honest slow-state messaging.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-5 text-primary" aria-hidden /> Business-rule scenarios
          </CardTitle>
          <CardDescription>One click sets up the exact acceptance scenario to exercise.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {scenarios.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={busy !== null || !can("demo.controls")}
              onClick={() => scenario(s.key)}
              className="flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50 disabled:opacity-60"
            >
              <s.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.copy}</span>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {lastResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last operation result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="scroll-soft max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs">{lastResult}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
