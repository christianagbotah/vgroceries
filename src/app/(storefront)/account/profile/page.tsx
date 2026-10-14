"use client";

import { useEffect, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, ShieldCheck, UserRound } from "lucide-react";

export default function AccountProfilePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const profile = await apiOps.accountProfile();
        setName(profile.customer.name);
        setPhone(profile.customer.phone);
        setEmail(profile.customer.email ?? "");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load your profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await apiOps.accountProfileUpdate({ name, phone, email });
      setName(updated.customer.name);
      setPhone(updated.customer.phone);
      setEmail(updated.customer.email ?? "");
      toast({ title: "Profile updated", description: "Your account details have been saved." });
    } catch (e) {
      toast({
        title: "Could not update profile",
        description: e instanceof ApiError ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={3} label="Loading profile" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound className="size-5 text-primary" aria-hidden /> Personal details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={save}>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full name</Label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 pl-9" autoComplete="name" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 pl-9" inputMode="tel" autoComplete="tel" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-9" autoComplete="email" />
              </div>
            </div>
            <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={saving || !name.trim() || !phone.trim()}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="size-5 text-primary" aria-hidden /> Account security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Profile changes are kept separate from payment details and order history.</p>
          <p>Use the Log out action in the account header when you finish on a shared device.</p>
          <p className="rounded-xl border border-dashed p-3 text-xs">Password and multi-factor controls will use the same account security area when customer authentication is connected to the production identity service.</p>
        </CardContent>
      </Card>
    </div>
  );
}
