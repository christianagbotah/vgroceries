"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useSubmissionFeedbackFocus } from "@/hooks/use-submission-feedback-focus";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const responseRef = useRef<HTMLDivElement>(null);
  useSubmissionFeedbackFocus(done || error, responseRef);

  useEffect(() => {
    // The token is in the URL fragment, never sent to the web server as a GET
    // query, never stored in localStorage, never included in analytics/referrers.
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    const valid = /^[a-f0-9]{64}$/.test(raw) ? raw : "";
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const frame = window.requestAnimationFrame(() => {
      setToken(valid);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 12 || password.length > 256) {
      setError("Use a password with 12 to 256 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/password-reset/complete", {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json: { ok?: boolean; error?: { message?: string } } = await response.json();
      if (!response.ok || !json.ok)
        throw new Error(json.error?.message || "This reset link could not be used. Request a fresh link.");
      setPassword("");
      setConfirm("");
      setToken("");
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-3xl font-bold">Set a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose a strong password you have not used before.</p>
      </div>
      {done ? (
        <div ref={responseRef} tabIndex={-1} role="status" className="scroll-mt-28 space-y-3 rounded-2xl border bg-card p-6 outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ShieldCheck className="size-8 text-primary" aria-hidden />
          <h2 className="font-semibold">Password changed</h2>
          <p className="text-sm leading-6">Your old sessions were signed out. Sign in again using your new password.</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="font-bold text-primary underline" href="/account/login">Customer sign in</Link>
            <Link className="font-bold text-primary underline" href="/staff/login">Staff sign in</Link>
          </div>
        </div>
      ) : !ready ? (
        <p role="status" className="text-center text-sm text-muted-foreground">Checking your recovery link…</p>
      ) : !token ? (
        <div role="alert" className="space-y-3 rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Missing or invalid reset link</h2>
          <p className="text-sm">Open the original reset email link, or request a new one.</p>
          <Link className="text-sm font-bold text-primary underline" href="/forgot-password">Request a new reset link</Link>
        </div>
      ) : (
        <form className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" onSubmit={submit}>
          <label className="block space-y-1.5 text-sm font-semibold" htmlFor="new-password">
            New password
          </label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={256}
            required value={password} onChange={e => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          <label className="block space-y-1.5 text-sm font-semibold" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={256}
            required value={confirm} onChange={e => setConfirm(e.target.value)}
            className="h-12 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          {error ? <div ref={responseRef} tabIndex={-1} role="alert" className="scroll-mt-28 rounded-lg border border-destructive/30 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive">{error}</div> : null}
          <button type="submit" disabled={busy}
            className="h-12 w-full rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
            {busy ? "Updating password…" : "Change password"}
          </button>
          <p className="text-xs text-muted-foreground">This link can be used only once. Resetting your password signs out your other devices.</p>
        </form>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-5 text-sm">
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">Request a new link</Link>
        <Link href="/support" className="font-semibold text-primary hover:underline">Contact support</Link>
      </div>
    </main>
  );
}
