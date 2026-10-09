"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiOps, ApiError } from "@/services/client";
import { useRiderSession } from "@/components/layout/rider-shell";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Bike, MapPin } from "lucide-react";

export default function RiderLoginPage() {
  const router = useRouter();
  const { setRider, riderId } = useRiderSession();
  const [riders, setRiders] = useState<{ id: string; name: string; kind: string; vehicle: string; isDemo: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRiders(await apiOps.riderLogin());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load riders.");
      }
    })();
  }, []);

  useEffect(() => {
    if (riderId) router.replace("/rider");
  }, [riderId, router]);

  const choose = (id: string) => {
    setRider(id);
    router.push("/rider");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground" aria-hidden>
          <Bike className="size-8" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-2xl font-bold">Rider workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick your demo rider to start. In production this screen is the authentication boundary.
        </p>
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : riders === null ? (
        <LoadingState rows={3} label="Loading riders" />
      ) : (
        <div className="space-y-2">
          {riders.map((r) => (
            <Button
              key={r.id}
              variant="outline"
              size="lg"
              className="h-16 w-full justify-between px-4"
              onClick={() => choose(r.id)}
            >
              <span className="text-left">
                <span className="block text-base font-semibold">{r.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.kind.replace(/_/g, " ")} rider · {r.vehicle}
                </span>
              </span>
              <MapPin className="size-5 text-primary" aria-hidden />
            </Button>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Riders see only their own assigned customers. Location sharing is optional and
        permission-based.
      </p>
    </div>
  );
}
