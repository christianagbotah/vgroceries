"use client";

import { useEffect, useRef } from "react";
import type { PaymentProviderAction } from "@variety/contracts";

export function ProviderActionForm({ action }: { action?: PaymentProviderAction | null }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!action || action.kind !== "form_post") return;
    formRef.current?.requestSubmit();
  }, [action]);

  if (!action || action.kind !== "form_post") return null;

  return (
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <p className="font-semibold">Opening secure payment…</p>
      <p className="mt-1 text-xs text-muted-foreground">You are being transferred to the payment provider. Do not refresh this page while the secure payment form is opening.</p>
      <form ref={formRef} method="post" action={action.url} className="mt-3">
        {Object.entries(action.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button type="submit" className="text-xs font-bold text-primary underline underline-offset-4">Continue to secure payment</button>
      </form>
    </div>
  );
}
