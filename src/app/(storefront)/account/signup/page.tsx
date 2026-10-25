"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LockKeyhole, Mail, Phone, ShoppingBag, UserRound } from "lucide-react";

export default function CustomerSignupPage() {
  const router = useRouter();
  const [returnPath, setReturnPath] = useState("/account");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const safeReturnPath = candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/account";
    setReturnPath(safeReturnPath);
    let active = true;
    apiOps.accountSession().then((session) => {
      if (active && session.actor.role === "customer") router.replace(safeReturnPath);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Use at least 12 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const session = await apiOps.accountSignup(name, phone, password, email);
      if (session.actor.role !== "customer") {
        await apiOps.accountLogout().catch(() => undefined);
        setError("Could not create a customer account.");
        return;
      }
      router.replace(returnPath);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[72vh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-5 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground"><ShoppingBag className="size-6" aria-hidden /></span>
        <h1 className="mt-4 font-serif text-2xl font-bold sm:text-3xl">Create your Variety account</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Save your details, follow orders and keep your favourite groceries close at hand.</p>
      </div>
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg">Customer sign up</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="signup-name">Full name</Label>
              <div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="signup-name" autoComplete="name" className="h-11 pl-9" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signup-email">Email address (optional)</Label>
                <div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="signup-email" type="email" autoComplete="email" className="h-11 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-phone">Phone number</Label>
                <div className="relative"><Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="signup-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" className="h-11 pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="signup-password" type="password" autoComplete="new-password" className="h-11 pl-9" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required /></div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-confirm-password">Confirm password</Label>
                <div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="signup-confirm-password" type="password" autoComplete="new-password" className="h-11 pl-9" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={12} required /></div>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Use at least 12 characters. Your password is securely hashed and is never stored as plain text.</p>
            {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm text-muted-foreground">Already have an account? <Link href={returnPath === "/account" ? "/account/login" : `/account/login?next=${encodeURIComponent(returnPath)}`} className="font-medium text-primary hover:underline">Sign in</Link></p>
      <p className="mt-2 text-center text-sm text-muted-foreground">Prefer to shop first? <Link href="/shop" className="font-medium text-primary hover:underline">Browse groceries</Link></p>
    </div>
  );
}
