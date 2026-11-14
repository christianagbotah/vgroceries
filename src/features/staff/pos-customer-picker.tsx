"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifiedPosUat, type PosRegisteredCustomer } from "./verified-pos-uat-transport";

export type PosCustomerSelection =
  | { mode: "walk_in" }
  | { mode: "existing"; customerUserId: string; label: string }
  | { mode: "named"; customerName: string };

type Mode = PosCustomerSelection["mode"];

export function PosCustomerPicker({
  value, onChange, disabled, searchCustomers = verifiedPosUat.customers,
}: {
  value: PosCustomerSelection;
  onChange: (next: PosCustomerSelection) => void;
  disabled?: boolean;
  /** Demo customer previews must search ONLY mock data, not the real account directory. */
  searchCustomers?: (query: string) => Promise<PosRegisteredCustomer[]>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PosRegisteredCustomer[]>([]);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const mode = value.mode;

  useEffect(() => {
    if (mode !== "existing" || search.trim().length < 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void Promise.resolve().then(() => {
        if (!current) return [];
        setLooking(true);
        setLookupError("");
        return searchCustomers(search.trim());
      }).then(data => { if (current) setResults(data); })
        .catch(() => { if (current) {
          setLookupError("Customer search is unavailable. Please retry; guest sales are still possible.");
          setResults([]);
        } })
        .finally(() => { if (current) setLooking(false); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [mode, search, searchCustomers]);

  function changeMode(next: Mode) {
    setSearch("");
    setResults([]);
    setLookupError("");
    if (next === "walk_in") onChange({ mode: next });
    else if (next === "named") onChange({ mode: next, customerName: "" });
    else onChange({ mode: next, customerUserId: "", label: "" });
  }

  return <section className="space-y-3 rounded-xl border bg-card p-4"
    aria-labelledby="pos-customer-heading">
    <div className="space-y-1">
      <h2 id="pos-customer-heading" className="text-lg font-semibold">Customer for this sale</h2>
      <p className="text-sm text-muted-foreground">
        Registered customers can be linked to the sale. Other shoppers may buy without an account.
      </p>
    </div>
    <fieldset disabled={disabled} className="grid gap-2 sm:grid-cols-3">
      <legend className="sr-only">Choose customer type</legend>
      {([
        ["walk_in", "Walk-in Customer"],
        ["existing", "Existing Customer"],
        ["named", "New Customer Name"],
      ] as const).map(([id, label]) =>
        <label key={id} className={"flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold " +
          (mode === id ? "border-primary bg-primary/5" : "border-border")}>
          <input type="radio" name="pos-customer-mode" value={id} checked={mode === id}
            onChange={() => changeMode(id)} />
          {label}
        </label>
      )}
    </fieldset>
    {mode === "walk_in" && <p className="rounded-lg bg-muted/40 p-3 text-sm" role="status">
      Walk-in Customer selected. No account or name is required, and no new customer account will be created.
    </p>}
    {mode === "named" && <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor="pos-new-customer-name">
        Name for this sale (no registration required)
      </label>
      <Input id="pos-new-customer-name" autoComplete="off"
        value={value.mode === "named" ? value.customerName : ""}
        disabled={disabled} maxLength={120} placeholder="e.g. Ama Mensah"
        onChange={event => onChange({ mode: "named", customerName: event.target.value })} />
      <p className="text-xs text-muted-foreground">
        This name is saved with the receipt only. It does not create a login or register a customer.
      </p>
    </div>}
    {mode === "existing" && <div className="space-y-2">
      <label htmlFor="pos-customer-search" className="block text-sm font-medium">
        Find registered customer by name, phone or email
      </label>
      <Input id="pos-customer-search" type="search" autoComplete="off"
        value={search} disabled={disabled}
        onChange={event => {
          setSearch(event.target.value);
          setResults([]);
          setLookupError("");
          onChange({ mode: "existing", customerUserId: "", label: "" });
        }}
        placeholder="Type at least 2 characters" maxLength={80} />
      {looking && <p className="text-sm text-muted-foreground" role="status">Searching customers…</p>}
      {lookupError && <p role="alert" className="rounded-lg border border-destructive/40 p-2 text-sm text-destructive">{lookupError}</p>}
      {search.trim().length >= 2 && !looking && !lookupError && results.length === 0 &&
        <p className="text-sm text-muted-foreground">No matching registered customer. Choose Walk-in Customer or New Customer Name instead.</p>}
      {results.length > 0 && <ul aria-label="Matching registered customers"
        className="max-h-56 divide-y overflow-y-auto rounded-lg border">
        {results.map(customer =>
          <li key={customer.id}>
            <Button type="button" variant="ghost" disabled={disabled}
              className="h-auto min-h-12 w-full justify-start whitespace-normal py-2 text-left"
              onClick={() => onChange({
                mode: "existing", customerUserId: customer.id,
                label: customer.name,
              })}>
              <span>
                <strong className="block">{customer.name}</strong>
                <small className="text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</small>
              </span>
            </Button>
          </li>
        )}
      </ul>}
      {value.mode === "existing" && value.customerUserId &&
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Selected: <strong>{value.label}</strong> — this sale will be linked to the registered account.
        </p>}
    </div>}
  </section>;
}
