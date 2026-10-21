"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await apiOps.authLogin(email, password);
      if (session.actor.role !== "customer") {
        await apiOps.accountLogout(session.csrfToken).catch(() => undefined);
        setError("This sign-in is for customer accounts. Staff should use the staff login.");
        return;
      }
      router.replace("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[68vh] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Sign in to your account</CardTitle>
          <p className="text-sm text-muted-foreground">View your orders and wishlist using your Variety Groceries customer account.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5"><Label htmlFor="customer-email">Email address</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="h-11 pl-9" required /></div></div>
            <div className="space-y-1.5"><Label htmlFor="customer-password">Password</Label><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="customer-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="h-11 pl-9" required /></div></div>
            {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="h-11 w-full" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
          </form>
          <div className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><Link href="/track" className="hover:underline">Track a guest order</Link><Link href="/staff/login" className="hover:underline">Staff login</Link></div>
        </CardContent>
      </Card>
    </div>
  );
}
