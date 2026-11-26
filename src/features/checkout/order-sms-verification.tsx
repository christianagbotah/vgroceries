"use client";

import { useRef, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrderSmsVerification({ reference, onVerified }: {
  reference: string;
  onVerified: () => void;
}) {
  const [challenge, setChallenge] = useState<{ challengeId: string; expiresAt: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const nextRequest = useRef(0);

  async function requestCode() {
    if (lock.current || verified || Date.now() < nextRequest.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setChallenge(await apiOps.requestOrderOtp(reference));
      setCode("");
      nextRequest.current = Date.now() + 60_000;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the verification code.");
    } finally { lock.current = false; setBusy(false); }
  }
  async function verifyCode() {
    if (!challenge || !/^\d{6}$/.test(code) || lock.current || verified) return;
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      setChallenge(null);
      setCode("");
      setError("This code has expired. Request another code.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await apiOps.verifyOrderOtp(reference, challenge.challengeId, code);
      setCode("");
      setVerified(true);
      onVerified();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify the code.");
    } finally { lock.current = false; setBusy(false); }
  }
  if (verified) return <p role="status" className="rounded-lg border p-3 text-sm">Your phone has been verified for this order. SMS updates are subject to delivery availability.</p>;
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3" aria-label="Verify phone for order SMS">
      <div>
        <h2 className="font-semibold">Verify your phone for order updates</h2>
        <p className="text-sm text-muted-foreground">You requested SMS updates. Verify the number supplied with this order. You can continue checkout without completing this optional step.</p>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void requestCode()}>
        {busy ? "Please wait…" : challenge ? "Resend verification code (after 1 minute)" : "Send verification code"}
      </Button>
      {challenge ? <div className="space-y-2">
        <Label htmlFor="checkout-sms-code">SMS verification code</Label>
        <Input id="checkout-sms-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button type="button" disabled={busy || code.length !== 6} onClick={() => void verifyCode()}>Verify phone</Button>
      </div> : null}
    </section>
  );
}
