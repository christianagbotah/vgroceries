import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, ShieldCheck, Store, Bike } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Demo access to the Variety Groceries back office.",
};

/** Demo access point and the future authentication boundary. */
export default function StaffLoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary font-serif text-2xl font-bold text-primary-foreground" aria-hidden>
            V
          </span>
          <h1 className="mt-4 font-serif text-2xl font-bold">Variety Groceries staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Back office, dispatch and rider workspaces — demo access.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <h2 className="font-semibold">Choose your workspace</h2>
              <p className="text-sm text-muted-foreground">
                In this prototype, sign-in is a demo role selector. In production, real
                authentication replaces this screen and every operation is access-controlled by the
                backend.
              </p>
            </div>
            <div className="grid gap-3">
              <Button asChild size="lg" className="h-14 justify-start gap-3 text-base">
                <Link href="/admin">
                  <ShieldCheck className="size-5" aria-hidden /> Staff back office
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 justify-start gap-3 text-base">
                <Link href="/rider/login">
                  <Bike className="size-5" aria-hidden /> Rider workspace
                </Link>
              </Button>
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Demo identities are fictional. No real shared credentials exist — production sign-in
              is the integration team&apos;s responsibility.
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:underline focus-visible:underline">
            <Store className="size-4" aria-hidden /> Back to the storefront
          </Link>
        </p>
      </div>
    </div>
  );
}
