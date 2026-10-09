"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/features/checkout/cart-store";
import { apiOps, ApiError } from "@/services/client";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { isValidGhanaPhone, isValidGhanaPostGps } from "@/lib/format";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PAYMENT_METHOD_LABELS } from "@/types/domain";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Lock, MapPin, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types/domain";

type Zone = { id: string; name: string; areas: string[]; feeMinor: number; minimumOrderMinor: number; serviceHours: string; cutoff: string };
type Slot = { id: string; zoneId: string; date: string; window: string; capacity: number; booked: number };
type AccountSummary = Awaited<ReturnType<typeof apiOps.accountSummary>>;

export default function CheckoutPage() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const clearCart = useCart((s) => s.clear);

  const [zones, setZones] = useState<Zone[]>([]);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fulfilment, setFulfilment] = useState<"delivery" | "collection">("delivery");
  const [zoneId, setZoneId] = useState<string>("");
  const [slotId, setSlotId] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [note, setNote] = useState("");

  const [addressId, setAddressId] = useState<string>("new");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [locality, setLocality] = useState("");
  const [street, setStreet] = useState("");
  const [landmark, setLandmark] = useState("");
  const [ghanaPostGps, setGhanaPostGps] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mobile_money");
  const [placing, setPlacing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [orderError, setOrderError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ productName: string; variantName: string; requested: string; available: string }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [z, acct] = await Promise.all([apiOps.zones(), apiOps.accountSummary()]);
        setZones(z);
        setAccount(acct);
        if (z[0]) setZoneId(z[0].id);
        setCustomerName(acct.customer.name.replace(" (demo)", ""));
        setCustomerPhone(acct.customer.phone);
        setCustomerEmail(acct.customer.email ?? "");
        const defaultAddr = acct.addresses.find((a) => a.isDefault) ?? acct.addresses[0];
        if (defaultAddr) {
          setAddressId(defaultAddr.id);
          setRecipientName(defaultAddr.recipientName);
          setPhone(defaultAddr.phone);
          setLocality(defaultAddr.locality);
          setStreet(defaultAddr.street);
          setLandmark(defaultAddr.landmark ?? "");
          setGhanaPostGps(defaultAddr.ghanaPostGps ?? "");
          const zid = z.find((zz) => zz.id === (defaultAddr as { zoneId?: string }).zoneId);
          if (zid) setZoneId(zid.id);
        }
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.message : "Could not load checkout details.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (fulfilment !== "delivery" || !zoneId) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await apiOps.slots(zoneId);
        if (!cancelled) {
          setSlots(s);
          setSlotId(s[0]?.id ?? "");
        }
      } catch {
        if (!cancelled) setSlots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneId, fulfilment]);

  const zone = zones.find((z) => z.id === zoneId);
  const slot = slots.find((s) => s.id === slotId);

  const subtotal = useMemo(() => {
    // estimate from known prices; the service recalculates authoritatively
    return lines.reduce((a, l) => a + (l.priceMinor ?? 0) * Number(l.quantity), 0);
  }, [lines]);

  const deliveryFee = fulfilment === "delivery" ? zone?.feeMinor ?? 0 : 0;
  const total = subtotal + deliveryFee;
  const meetsMinimum = fulfilment === "collection" || !zone || subtotal >= zone.minimumOrderMinor;

  useEffect(() => {
    if (!zone && zones.length) setZoneId(zones[0].id);
  }, [zone, zones]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customerName = "Enter the contact name for this order.";
    if (!isValidGhanaPhone(customerPhone)) errs.customerPhone = "Enter a valid Ghana number, e.g. +233 24 123 4567.";
    if (customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) errs.customerEmail = "Enter a valid email or leave it empty.";
    if (fulfilment === "delivery") {
      if (!zoneId) errs.zoneId = "Choose a delivery zone.";
      if (!slotId && slots.length) errs.slotId = "Choose a delivery slot.";
      if (addressId === "new") {
        if (!recipientName.trim()) errs.recipientName = "Who should receive the order?";
        if (!isValidGhanaPhone(phone)) errs.phone = "Recipient phone must be a +233 number.";
        if (!locality.trim()) errs.locality = "Enter the locality (e.g. Labone).";
        if (!street.trim()) errs.street = "Enter the street or a descriptive address.";
        if (ghanaPostGps && !isValidGhanaPostGps(ghanaPostGps)) errs.ghanaPostGps = "GhanaPostGPS addresses look like GA-457-2029.";
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const placeOrder = async () => {
    if (!validate()) {
      document.querySelector<HTMLElement>("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPlacing(true);
    setOrderError(null);
    setConflicts([]);
    try {
      const result = await apiOps.complete({
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        customerName: customerName.trim(),
        customerPhone: customerPhone.replace(/[\s-]/g, ""),
        customerEmail: customerEmail.trim() || undefined,
        fulfilment,
        zoneId: fulfilment === "delivery" ? zoneId : undefined,
        slotId: fulfilment === "delivery" ? slotId : undefined,
        paymentMethod,
        note: note.trim() || undefined,
        addressId: fulfilment === "delivery" && addressId !== "new" ? addressId : undefined,
        guestAddress:
          fulfilment === "delivery" && addressId === "new"
            ? {
                label: "Delivery address",
                recipientName: recipientName.trim(),
                phone: phone.replace(/[\s-]/g, ""),
                locality: locality.trim(),
                street: street.trim(),
                landmark: landmark.trim() || undefined,
                ghanaPostGps: ghanaPostGps.trim().toUpperCase() || undefined,
              }
            : undefined,
        idempotencyKey: `co_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      clearCart();
      router.push(`/checkout/status/${result.orderId}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setOrderError(e.message);
        if (e.code === "OUT_OF_STOCK" && Array.isArray(e.details)) {
          setConflicts((e.details as typeof conflicts).map((d: never) => {
            const x = d as { productName: string; variantName: string; requested: string; available: string };
            return { productName: x.productName, variantName: x.variantName, requested: x.requested, available: x.available };
          }));
        }
      } else {
        setOrderError("The order could not be placed. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <h1 className="mb-4 font-serif text-2xl font-bold sm:text-3xl">Checkout</h1>
        <LoadingState rows={4} label="Preparing checkout" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <h1 className="mb-4 font-serif text-2xl font-bold sm:text-3xl">Checkout</h1>
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <h1 className="mb-4 font-serif text-2xl font-bold sm:text-3xl">Checkout</h1>
        <EmptyState
          title="Nothing to check out"
          description="Your cart is empty. Add available groceries first."
          action={{ label: "Go shopping", href: "/shop" }}
        />
      </div>
    );
  }

  const field = (key: string) =>
    fieldErrors[key] ? (
      <p role="alert" data-error="true" className="mt-1 text-sm text-destructive">
        {fieldErrors[key]}
      </p>
    ) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Checkout</h1>
        <Button asChild variant="ghost" size="sm" className="h-10">
          <Link href="/cart">
            <ArrowLeft className="size-4" aria-hidden /> Back to cart
          </Link>
        </Button>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-3.5" aria-hidden /> Guest checkout — an account is optional. Stock is reserved when the order is placed.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* 1 — contact */}
          <section aria-labelledby="co-contact" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 id="co-contact" className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>1</span>
              Contact details
            </h2>
            {account?.customer ? (
              <p className="rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
                Signed in as <strong className="text-foreground">{account.customer.name}</strong> (demo account —{" "}
                <Link href="/account" className="text-primary hover:underline focus-visible:underline">account area</Link>)
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="co-name">Full name</Label>
                <Input id="co-name" className="h-11" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" />
                {field("customerName")}
              </div>
              <div>
                <Label htmlFor="co-phone">Phone (Ghana)</Label>
                <Input id="co-phone" className="h-11" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+233 24 123 4567" autoComplete="tel" inputMode="tel" />
                {field("customerPhone")}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="co-email">Email (optional)</Label>
                <Input id="co-email" className="h-11" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />
                {field("customerEmail")}
              </div>
            </div>
          </section>

          {/* 2 — fulfilment */}
          <section aria-labelledby="co-fulfil" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 id="co-fulfil" className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>2</span>
              Delivery or collection
            </h2>
            <RadioGroup
              value={fulfilment}
              onValueChange={(v) => setFulfilment(v as "delivery" | "collection")}
              className="grid gap-3 sm:grid-cols-2"
              aria-label="Fulfilment method"
            >
              <Label data-clickable htmlFor="ful-delivery" className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal", fulfilment === "delivery" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="delivery" id="ful-delivery" className="mt-1" />
                <span>
                  <span className="flex items-center gap-1.5 font-medium"><Truck className="size-4" aria-hidden /> Home delivery</span>
                  <span className="text-sm text-muted-foreground">Slotted windows across Accra zones</span>
                </span>
              </Label>
              <Label data-clickable htmlFor="ful-collection" className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal", fulfilment === "collection" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="collection" id="ful-collection" className="mt-1" />
                <span>
                  <span className="flex items-center gap-1.5 font-medium"><Store className="size-4" aria-hidden /> Collect in store</span>
                  <span className="text-sm text-muted-foreground">Ready same day · pay at pickup if you like</span>
                </span>
              </Label>
            </RadioGroup>

            {fulfilment === "delivery" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="co-zone">Delivery zone</Label>
                    <Select value={zoneId} onValueChange={setZoneId}>
                      <SelectTrigger id="co-zone" className="h-11 w-full">
                        <SelectValue placeholder="Choose a zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {zones.map((z) => (
                          <SelectItem key={z.id} value={z.id}>
                            {z.name} — {formatMoney(z.feeMinor)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field("zoneId")}
                    {zone ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {zone.areas.join(" · ")} · {zone.serviceHours} · {zone.cutoff}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="co-slot">Delivery slot</Label>
                    <Select value={slotId} onValueChange={setSlotId} disabled={!slots.length}>
                      <SelectTrigger id="co-slot" className="h-11 w-full">
                        <SelectValue placeholder={slots.length ? "Choose a slot" : "No slots available"} />
                      </SelectTrigger>
                      <SelectContent>
                        {slots.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.window} · {s.date} ({s.capacity - s.booked} left)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field("slotId")}
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border p-3 sm:p-4">
                  <div>
                    <Label htmlFor="co-address">Delivery address</Label>
                    <Select value={addressId} onValueChange={setAddressId}>
                      <SelectTrigger id="co-address" className="h-11 w-full">
                        <SelectValue placeholder="Choose an address" />
                      </SelectTrigger>
                      <SelectContent>
                        {(account?.addresses ?? []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.label} — {a.street}, {a.locality}
                          </SelectItem>
                        ))}
                        <SelectItem value="new">New address…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {addressId === "new" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="co-recipient">Recipient name</Label>
                        <Input id="co-recipient" className="h-11" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} autoComplete="name" />
                        {field("recipientName")}
                      </div>
                      <div>
                        <Label htmlFor="co-phone2">Recipient phone</Label>
                        <Input id="co-phone2" className="h-11" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 24 123 4567" inputMode="tel" />
                        {field("phone")}
                      </div>
                      <div>
                        <Label htmlFor="co-locality">Locality / area</Label>
                        <Input id="co-locality" className="h-11" value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="e.g. Labone" />
                        {field("locality")}
                      </div>
                      <div>
                        <Label htmlFor="co-street">Street or descriptive address</Label>
                        <Input id="co-street" className="h-11" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="e.g. 12 Labone Crescent" />
                        {field("street")}
                      </div>
                      <div>
                        <Label htmlFor="co-landmark">Landmark (optional)</Label>
                        <Input id="co-landmark" className="h-11" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. near the coffee shop" />
                      </div>
                      <div>
                        <Label htmlFor="co-gps">GhanaPostGPS address (optional)</Label>
                        <Input id="co-gps" className="h-11 font-mono" value={ghanaPostGps} onChange={(e) => setGhanaPostGps(e.target.value)} placeholder="e.g. GA-457-2029" />
                        {field("ghanaPostGps")}
                        <p className="mt-1 text-xs text-muted-foreground">
                          A digital address helps riders find you. We store it as text — map
                          integration is a future backend feature.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                Collect from our store during opening hours (demo location). We will notify you when
                your order is packed and waiting.
              </p>
            )}
          </section>

          {/* 3 — payment */}
          <section aria-labelledby="co-payment" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 id="co-payment" className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>3</span>
              Payment
            </h2>
            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} className="grid gap-2 sm:grid-cols-2" aria-label="Payment method">
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
                .filter((m) => (m === "cash_on_delivery" ? fulfilment === "delivery" : true))
                .map((m) => (
                  <Label key={m} data-clickable htmlFor={`pay-${m}`} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal", paymentMethod === m && "border-primary bg-primary/5")}>
                    <RadioGroupItem value={m} id={`pay-${m}`} />
                    <span className="text-sm font-medium">{PAYMENT_METHOD_LABELS[m]}</span>
                  </Label>
                ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {paymentMethod === "mobile_money" || paymentMethod === "card_hosted" || paymentMethod === "bank_transfer"
                ? "You will confirm the payment on the next screen. A redirect alone never marks an order paid — the provider outcome is verified by the service. No real payment is taken in this prototype."
                : paymentMethod === "cash_counter"
                  ? "Pay with cash at the counter when you collect. The order can be prepared before payment."
                  : "Have the exact amount ready for the rider. Delivery completion and cash collection are recorded separately."}
            </p>
          </section>

          {/* 4 — review */}
          <section aria-labelledby="co-review" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 id="co-review" className="text-lg font-semibold">
              <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>4</span>
              Review and place order
            </h2>
            <div>
              <Label htmlFor="co-note">Order note (optional)</Label>
              <Textarea id="co-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. please include ripe plantain" />
            </div>

            {orderError ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <div className="space-y-2">
                  <p>{orderError}</p>
                  {conflicts.length ? (
                    <ul className="list-inside list-disc text-muted-foreground">
                      {conflicts.map((c, i) => (
                        <li key={i}>
                          {c.productName} ({c.variantName}): requested {c.requested}, only {c.available} left
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <Link href="/cart">Adjust the cart</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            <Button size="lg" className="h-12 w-full text-base" onClick={placeOrder} disabled={placing || !meetsMinimum}>
              {placing ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden /> Placing your order…
                </>
              ) : (
                <>
                  Place order · {formatMoney(total)} <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By placing this order you agree to our{" "}
              <Link href="/terms" className="underline hover:text-foreground">terms</Link> and{" "}
              <Link href="/returns-policy" className="underline hover:text-foreground">returns policy</Link>.
            </p>
          </section>
        </div>

        {/* summary */}
        <aside className="h-fit space-y-3 rounded-xl border bg-card p-4 lg:sticky lg:top-32" aria-label="Order summary">
          <h2 className="font-semibold">Order summary</h2>
          <ul className="space-y-2 text-sm">
            {lines.map((l) => (
              <li key={l.variantId} className="flex items-center gap-2">
                <span className="relative size-10 shrink-0 overflow-hidden rounded bg-muted" aria-hidden>
                  <Image src={l.image} alt="" fill sizes="40px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {l.name} <span className="text-muted-foreground">×{l.quantity}</span>
                </span>
                <span className="font-medium tabular-nums">{formatMoney((l.priceMinor ?? 0) * Number(l.quantity))}</span>
              </li>
            ))}
          </ul>
          <Separator />
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{fulfilment === "delivery" ? "Delivery fee" : "Collection"}</span>
              <span className="font-medium tabular-nums">{fulfilment === "delivery" ? formatMoney(deliveryFee) : "Free"}</span>
            </div>
            {zone && fulfilment === "delivery" ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slot</span>
                <span className="text-muted-foreground">{slot ? `${slot.window} · ${slot.date}` : "—"}</span>
              </div>
            ) : null}
          </div>
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>Total (est.)</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>
          {fulfilment === "delivery" && zone && !meetsMinimum ? (
            <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm">
              Minimum order for {zone.name} is {formatMoney(zone.minimumOrderMinor)} — add{" "}
              {formatMoney(zone.minimumOrderMinor - subtotal)} more, or choose collection.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Final totals are calculated by the service; your items are reserved for 30 minutes once
            the order is placed.
          </p>
        </aside>
      </div>
    </div>
  );
}
