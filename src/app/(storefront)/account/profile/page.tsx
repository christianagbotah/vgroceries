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
  const [savedPhone, setSavedPhone] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; expiresAt: string } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);
  const requestOtp = async () => {
    setOtpBusy(true); setOtpError(null);
    try {
      const result = await apiOps.accountPhoneOtpRequest();
      setChallenge(result); setOtpCode(""); setOtpVerified(false);
      setResendAt(Date.now() + 60000);
      toast({ title: "Verification code sent", description: "Enter the six-digit code sent to your saved phone number." });
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : "Could not send verification code.");
    } finally { setOtpBusy(false); }
  };
  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setOtpBusy(true); setOtpError(null);
    try {
      await apiOps.accountPhoneOtpVerify(challenge.challengeId, otpCode);
      setOtpVerified(true); setChallenge(null); setOtpCode("");
      toast({ title: "Phone verified", description: "Your saved phone number is now verified." });
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : "Verification failed. Check the code and try again.");
    } finally { setOtpBusy(false); }
  };

  useEffect(() => {
    (async () => {
      try {
        const profile = await apiOps.accountProfile();
        setName(profile.customer.name);
        setPhone(profile.customer.phone);
        setSavedPhone(profile.customer.phone);
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
      if (updated.customer.phone !== savedPhone) {
        setChallenge(null); setOtpVerified(false); setOtpCode("");
      }
      setSavedPhone(updated.customer.phone);
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
          <div className="rounded-xl border p-4 space-y-3">
            <p className="font-semibold text-foreground">Phone verification</p>
            <p>Verify your saved phone number by SMS. Save any phone changes first.</p>
            {otpVerified && <p role="status" className="text-green-700">Phone verified successfully.</p>}
            {phone !== savedPhone && <p role="status">Save your new phone number before requesting a code.</p>}
            {otpError && <p role="alert" className="text-destructive">{otpError}</p>}
            <Button type="button" variant="outline" disabled={otpBusy || phone !== savedPhone || !savedPhone || (Boolean(challenge) && clock < resendAt)} onClick={requestOtp}>
              {otpBusy ? "Please wait…" : challenge ? clock < resendAt ? `Resend in ${Math.ceil((resendAt - clock) / 1000)}s` : "Resend code" : "Send verification code"}
            </Button>
            {challenge && <form className="space-y-3" onSubmit={verifyOtp}>
              <Label htmlFor="account-otp-code">Six-digit SMS code</Label>
              <Input id="account-otp-code" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
              <p>Code expires {new Date(challenge.expiresAt).toLocaleTimeString()}.</p>
              <Button type="submit" disabled={otpBusy || otpCode.length !== 6 || clock >= new Date(challenge.expiresAt).getTime()}>Verify phone</Button>
            </form>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
