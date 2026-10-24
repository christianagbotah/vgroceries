"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LockKeyhole, Mail, ShoppingBag } from "lucide-react";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [returnPath, setReturnPath] = useState("/account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    setBusy(true);
    setError(null);
    try {
      const session = await apiOps.accountLogin(email, password);
      if (session.actor.role !== "customer") {
        await apiOps.accountLogout().catch(() => undefined);
        setError("This sign-in is not a customer account.");
        return;
      }
      router.replace(returnPath);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[68vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-5 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground"><ShoppingBag className="size-6" aria-hidden /></span>
        <h1 className="mt-4 font-serif text-2xl font-bold">Sign in to your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">View your orders, saved addresses, wishlist and profile.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Customer sign in</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="customer-email">Email address</Label>
              <div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="customer-email" type="email" autoComplete="email" className="h-11 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-password">Password</Label>
              <div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="customer-password" type="password" autoComplete="current-password" className="h-11 pl-9" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            </div>
            {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm text-muted-foreground">New to Variety Groceries? <Link href={returnPath === "/account" ? "/account/signup" : `/account/signup?next=${encodeURIComponent(returnPath)}`} className="font-medium text-primary hover:underline">Create an account</Link></p>
      <p className="mt-2 text-center text-sm text-muted-foreground">Continue shopping? <Link href="/shop" className="font-medium text-primary hover:underline">Back to the shop</Link></p>
    </div>
  );
}
