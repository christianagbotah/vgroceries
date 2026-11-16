"use client";

import { useEffect, useRef, useState } from "react";
import type { PosCustomerSearchItem } from "@/services/contracts";
import { ApiError } from "@/services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  posCustomerLookupUatEnabled,
  searchVerifiedPosCustomers,
} from "./verified-pos-customer-lookup";

export type PosCustomerSelection =
  | { mode: "walk_in" }
  | { mode: "named"; customerName: string }
  | { mode: "existing"; customerUserId: string; label: string };

type CustomerMode = PosCustomerSelection["mode"];

function describeLookupFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NOT_FOUND" || error.code === "FEATURE_DISABLED")
      return "The server has not enabled registered-customer lookup. Walk-in selection remains available.";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")
      return "Your current cashier account or branch permissions do not allow this search.";
    if (error.code === "HTTP_429" || error.code === "RATE_LIMITED")
      return "Search limit reached. Try again later.";
    return error.code === "BAD_RESPONSE"
      ? error.message
      : "Customer search could not be verified. Try again or use Walk-in.";
  }
  return "Customer search is unavailable. You can still select Walk-in.";
}

/**
 * Restricted UAT customer picker. No sale creation; the selection is kept
 * only in this component's memory. The API is authoritative for actual
 * customer existence and branch entitlement at eventual sale completion.
 */
export function VerifiedPosCustomerPicker({
  disabled = false,
  searchCustomers = searchVerifiedPosCustomers,
}: {
  disabled?: boolean;
  /** Explicit injection allows offline fixture tests without real accounts. */
  searchCustomers?: (query: string) => Promise<PosCustomerSearchItem[]>;
}) {
  const [selection, setSelection] = useState<PosCustomerSelection>({ mode: "walk_in" });
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PosCustomerSearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);

  function resetSearch() {
    ++revision.current;
    setQuery("");
    setMatches([]);
    setBusy(false);
    setSearched(false);
    setError("");
  }
  function changeMode(mode: CustomerMode) {
    resetSearch();
    setSelection(mode === "walk_in"
      ? { mode: "walk_in" }
      : mode === "named"
        ? { mode: "named", customerName: "" }
        : { mode: "existing", customerUserId: "", label: "" });
  }

  useEffect(() => {
    if (disabled || selection.mode !== "existing") return;
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const id = ++revision.current;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError("");
      setSearched(false);
      void searchCustomers(normalized).then((result) => {
        if (revision.current !== id) return;
        setMatches(result);
        setSearched(true);
      }).catch((cause: unknown) => {
        if (revision.current !== id) return;
        setError(describeLookupFailure(cause));
        setMatches([]);
      }).finally(() => {
        if (revision.current === id) setBusy(false);
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      ++revision.current;
    };
  }, [disabled, query, searchCustomers, selection.mode]);

  // A flag is a presentation precondition, not an authorization grant.
  if (!posCustomerLookupUatEnabled) return null;

  return (
    <section aria-labelledby="verified-pos-customer-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Restricted cashier UAT · Read only</p>
        <h2 id="verified-pos-customer-title" className="text-xl font-semibold">Customer selection preview</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Select a customer for a future counter sale. This preview cannot create an order,
          register an account, reserve stock or collect payment.
        </p>
      </div>
      <fieldset disabled={disabled} className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Customer type</legend>
        {([
          ["walk_in", "Walk-in customer"],
          ["existing", "Registered customer"],
          ["named", "Name for receipt"],
        ] as const).map(([mode, label]) => (
          <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium">
            <input type="radio" name="verified-pos-customer-mode" value={mode}
              checked={selection.mode === mode} onChange={() => changeMode(mode)} />
            {label}
          </label>
        ))}
      </fieldset>
      {selection.mode === "walk_in" ? (
        <p role="status" className="rounded-lg bg-muted/40 p-3 text-sm">
          Walk-in selected. No account is required or created.
        </p>
      ) : null}
      {selection.mode === "named" ? (
        <div className="space-y-2">
          <label htmlFor="verified-pos-customer-name" className="text-sm font-medium">
            Customer name (receipt only)
          </label>
          <Input id="verified-pos-customer-name" autoComplete="off" maxLength={120}
            placeholder="e.g. Ama Mensah" disabled={disabled}
            value={selection.customerName}
            onChange={(event) => setSelection({ mode: "named", customerName: event.target.value })} />
          <p className="text-xs text-muted-foreground">
            A name does not register the customer or link a login.
          </p>
        </div>
      ) : null}
      {selection.mode === "existing" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="verified-pos-customer-search" className="text-sm font-medium">
              Search by name, phone or email
            </label>
            <Input id="verified-pos-customer-search" type="search" autoComplete="off"
              value={query} maxLength={80} disabled={disabled} placeholder="Type at least 2 characters"
              onChange={(event) => {
                ++revision.current;
                setQuery(event.target.value);
                setMatches([]);
                setSearched(false);
                setError("");
                setSelection({ mode: "existing", customerUserId: "", label: "" });
              }} />
            <p className="text-xs text-muted-foreground">
              Only customers linked to your current active branches appear. Phone numbers are masked.
            </p>
          </div>
          {busy ? <p role="status" className="text-sm">Searching allowed customer records…</p> : null}
          {error ? <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
          {searched && !busy && !matches.length && !error ? (
            <p role="status" className="text-sm text-muted-foreground">
              No matching registered customer. You can use Walk-in or Name for receipt.
            </p>
          ) : null}
          {matches.length > 0 ? (
            <ul aria-label="Registered customer matches" className="max-h-60 divide-y overflow-y-auto rounded-lg border">
              {matches.map((person) => (
                <li key={person.id}>
                  <Button type="button" variant="ghost" disabled={disabled}
                    className="h-auto min-h-12 w-full justify-start gap-2 whitespace-normal py-2 text-left"
                    onClick={() => {
                      ++revision.current;
                      setMatches([]);
                      setSelection({ mode: "existing", customerUserId: person.id, label: person.name });
                    }}>
                    <span className="min-w-0">
                      <span className="block font-semibold">{person.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {person.phoneLast4 ? "Phone ending " + person.phoneLast4 : "Phone not on file"}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {selection.customerUserId ? (
            <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              Preview selection: <strong>{selection.label}</strong>. A future sale must re-verify the
              account and your branch rights before linking.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
