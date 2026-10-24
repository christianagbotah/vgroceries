"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

export default function PaymentReturnPage() {
  const router = useRouter();
  const [missingOrder, setMissingOrder] = useState(false);

  useEffect(() => {
    const orderId = window.sessionStorage.getItem("vg_payment_order_id");
    if (!orderId) {
      const timer = window.setTimeout(() => setMissingOrder(true), 0);
      return () => window.clearTimeout(timer);
    }
    router.replace(`/checkout/status/${encodeURIComponent(orderId)}`);
  }, [router]);

  if (missingOrder) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14 text-center">
        <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="mt-4 font-serif text-2xl font-bold">Payment return received</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We could not identify the order from this browser session. A provider return page never changes payment status by itself.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild><Link href="/account/orders">View my orders</Link></Button>
          <Button asChild variant="outline"><Link href="/track">Track an order</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-4 py-14 text-center">
      <Loader2 className="size-9 animate-spin text-primary" aria-hidden />
      <h1 className="mt-4 font-serif text-2xl font-bold">Checking your payment</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        We are returning to your order and checking the provider-verified payment status. This return page never decides whether money was received.
      </p>
    </div>
  );
}
