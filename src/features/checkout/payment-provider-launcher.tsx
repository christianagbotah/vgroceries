"use client";

import { useEffect, useRef, useState } from "react";
import type { PaymentProviderAction } from "@variety/contracts";
import { ApiError, apiOps } from "@/services/client";
import { ProviderActionForm } from "@/features/checkout/provider-action-form";
import { Loader2, ShieldCheck } from "lucide-react";

type LaunchRecord = { key: string; launched: boolean };

function storageKey(orderId: string) {
  return `vg:payment-init:${orderId}`;
}

function validRecord(value: unknown): value is LaunchRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.key === "string" && /^[A-Za-z0-9:_-]{8,128}$/.test(row.key) && typeof row.launched === "boolean";
}

function loadRecord(orderId: string): LaunchRecord {
  const name = storageKey(orderId);
  try {
    const raw = localStorage.getItem(name);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (validRecord(parsed)) return parsed;
    }
  } catch { /* replace malformed browser state below */ }
  const record = { key: `pay_${crypto.randomUUID().replaceAll("-", "")}`, launched: false };
  localStorage.setItem(name, JSON.stringify(record));
  return record;
}

function saveRecord(orderId: string, record: LaunchRecord) {
  localStorage.setItem(storageKey(orderId), JSON.stringify(record));
}

export function PaymentProviderLauncher({
  orderId,
  active,
  finalized,
}: {
  orderId: string;
  active: boolean;
  finalized: boolean;
}) {
  const started = useRef(false);
  const [action, setAction] = useState<PaymentProviderAction | null>(null);
  const [working, setWorking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (finalized) {
      localStorage.removeItem(storageKey(orderId));
      setAction(null);
      setWaiting(false);
      return;
    }
    if (!active || started.current) return;
    const record = loadRecord(orderId);
    if (record.launched) {
      setWaiting(true);
      return;
    }

    started.current = true;
    setWorking(true);
    setError(null);
    sessionStorage.setItem("vg_payment_order_id", orderId);
    apiOps.paymentInitiate(orderId, record.key)
      .then((result) => {
        const next = result.action;
        if (next.kind === "redirect") {
          saveRecord(orderId, { ...record, launched: true });
          window.location.assign(next.url);
          return;
        }
        if (next.kind === "form_post") {
          saveRecord(orderId, { ...record, launched: true });
          setAction(next);
          return;
        }
        if (next.kind === "none") {
          setWaiting(true);
          return;
        }
        setAction(next);
      })
      .catch((cause) => {
        setError(cause instanceof ApiError ? cause.message : "Could not start the secure payment. Please try again.");
      })
      .finally(() => setWorking(false));
  }, [active, finalized, orderId]);

  if (!active || finalized) return null;
  if (action?.kind === "form_post") return <ProviderActionForm action={action} />;
  if (action?.kind === "prompt" || action?.kind === "instructions") {
    return (
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" /> Secure payment instruction</p>
        <p className="mt-2 text-muted-foreground">{action.message}</p>
        {action.reference ? <p className="mt-2 text-xs font-medium">Reference: {action.reference}</p> : null}
      </div>
    );
  }
  if (error) {
    return <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>;
  }
  if (working || waiting) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        {working ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : <ShieldCheck className="size-4 text-primary" aria-hidden />}
        <span>{working ? "Starting secure payment…" : "Waiting for the payment provider to confirm your payment…"}</span>
      </div>
    );
  }
  return null;
}
