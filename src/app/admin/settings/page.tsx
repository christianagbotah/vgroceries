"use client";

import { useEffect, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Settings2 } from "lucide-react";

interface Settings {
  businessName: string;
  supportPhone: string;
  supportEmail: string;
  deliveryEnabled: boolean;
  collectionEnabled: boolean;
  reservationTtlMinutes: number;
  currency: string;
  lowStockThreshold: string;
  refundsRequireApproval: boolean;
  codEnabled: boolean;
}

export default function AdminSettingsPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setSettings((await apiOps.settings()) as Settings);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load settings.");
      }
    })();
  }, []);

  const save = async (patch: Partial<Settings>) => {
    setBusy(true);
    try {
      const next = (await apiOps.settingsUpdate({ ...patch, actor: user.id })) as Settings;
      setSettings(next);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!settings) return <LoadingState rows={3} label="Loading settings" />;

  const Toggle = ({ id, label, description, checked, onCheckedChange }: { id: string; label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void }) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={!can("settings.manage") || busy} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Business configuration. Actual delivery areas, fees, hours, refund policy, tax treatment
          and payment providers require owner configuration before launch.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="size-5 text-primary" aria-hidden /> Business</CardTitle>
          <CardDescription>Identity and contact channels (demo placeholders).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="st-name">Business name</Label><Input id="st-name" className="h-11" value={settings.businessName} disabled /></div>
          <div><Label htmlFor="st-phone">Support phone</Label><Input id="st-phone" className="h-11" value={settings.supportPhone} disabled /></div>
          <div><Label htmlFor="st-email">Support email</Label><Input id="st-email" className="h-11" value={settings.supportEmail} disabled /></div>
          <div><Label htmlFor="st-currency">Currency</Label><Input id="st-currency" className="h-11" value={`${settings.currency} (₵)`} disabled /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fulfilment</CardTitle>
          <CardDescription>Toggles apply immediately in the demo service.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle id="st-delivery" label="Home delivery" description="Delivery zones and slots offered at checkout" checked={settings.deliveryEnabled} onCheckedChange={(v) => save({ deliveryEnabled: v })} />
          <Toggle id="st-collection" label="In-store collection" description="Customers can choose to collect" checked={settings.collectionEnabled} onCheckedChange={(v) => save({ collectionEnabled: v })} />
          <Toggle id="st-cod" label="Cash on delivery" description="Available for delivery orders" checked={settings.codEnabled} onCheckedChange={(v) => save({ codEnabled: v })} />
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="st-ttl">Reservation window (minutes)</Label>
              <Input
                id="st-ttl"
                className="h-11 w-32"
                inputMode="numeric"
                value={String(settings.reservationTtlMinutes)}
                onChange={(e) => setSettings({ ...settings, reservationTtlMinutes: Number(e.target.value) || 0 })}
                disabled={!can("settings.manage")}
              />
            </div>
            <Button className="h-11" disabled={!can("settings.manage") || busy || settings.reservationTtlMinutes < 5} onClick={() => save({ reservationTtlMinutes: settings.reservationTtlMinutes })}>
              Save window
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle id="st-refund" label="Refunds require approval" description="Refund requests route through a reviewer" checked={settings.refundsRequireApproval} onCheckedChange={(v) => save({ refundsRequireApproval: v })} />
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Tax treatment is not configured — no Ghana tax rate is assumed or hardcoded. The
            authoritative calculation belongs to the backend.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
