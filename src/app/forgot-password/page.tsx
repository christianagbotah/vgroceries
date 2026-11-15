"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, KeyRound, ShieldCheck } from "lucide-react";
import { useSubmissionFeedbackFocus } from "@/hooks/use-submission-feedback-focus";
import { apiOps, ApiError } from "@/services/client";

const generic = "If an eligible account has that email address, a password reset link will be sent.";
const enabled = process.env.NEXT_PUBLIC_PASSWORD_RECOVERY_UAT === "1";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const noticeRef = useRef<HTMLDivElement>(null);
  useSubmissionFeedbackFocus(done || error, noticeRef);

  if (!enabled) return <main className="mx-auto max-w-lg space-y-4 px-4 py-12">
    <h1 className="font-serif text-3xl font-bold">Password recovery is not available</h1>
    <p className="text-sm">This recovery service has not been enabled for the current environment.</p>
    <Link href="/help" className="text-sm font-medium text-primary underline">Get help</Link>
  </main>;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiOps.passwordRecoveryRequest(email.trim().toLowerCase());
      setDone(true);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.code === "RATE_LIMITED"
        ? "Too many requests. Try again later."
        : reason instanceof Error ? reason.message : "Password recovery is unavailable. Try again later.");
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
        <h1 className="mt-4 font-serif text-3xl font-bold">Forgot your password?</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Recover a customer, staff, cashier or administrator account through its registered email.
        </p>
      </div>
      {done ? (
        <div ref={noticeRef} role="status" tabIndex={-1} className="scroll-mt-28 space-y-3 rounded-2xl border bg-card p-6 outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ShieldCheck className="size-8 text-primary" aria-hidden />
          <h2 className="font-semibold">Check your email</h2>
          <p className="text-sm leading-6">{generic}</p>
          <p className="text-sm text-muted-foreground">If it arrives, use the link within 20 minutes. Check your spam folder too. Never share the link with anyone.</p>
          <button type="button" className="text-sm font-bold text-primary underline" onClick={() => { setDone(false); setError(""); }}>
            Try another email
          </button>
        </div>
      ) : (
        <form className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" onSubmit={submit}>
          <label className="block space-y-1.5 text-sm font-semibold" htmlFor="reset-email">
            Registered email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input id="reset-email" type="email" autoComplete="email" required maxLength={254}
              className="h-12 w-full rounded-xl border bg-background pl-11 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {error ? <div ref={noticeRef} tabIndex={-1} role="alert"
            className="scroll-mt-28 rounded-lg border border-destructive/30 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive">{error}</div> : null}
          <button type="submit" disabled={busy}
            className="h-12 w-full rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
            {busy ? "Requesting secure link…" : "Send password reset link"}
          </button>
          <p className="text-xs leading-5 text-muted-foreground">
            For privacy, we do not reveal whether an email belongs to an account. If you registered using only a phone number, please contact customer support for verified assistance.
          </p>
        </form>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        <Link href="/account/login" className="font-semibold text-primary hover:underline">Customer sign in</Link>
        <Link href="/staff/login" className="font-semibold text-primary hover:underline">Staff sign in</Link>
        <Link href="/help" className="font-semibold text-primary hover:underline">Contact support</Link>
      </div>
    </main>
  );
}
