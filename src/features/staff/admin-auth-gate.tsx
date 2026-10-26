"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, apiOps } from "@/services/client";
import { ErrorState, LoadingState } from "@/components/shared/states";

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    apiOps.staffSession().then((session) => {
      if (!active) return;
      const allowed = session.actor.role === "admin" || session.actor.role === "inventory_manager";
      if (!allowed) {
        const next = pathname.startsWith("/admin") ? pathname : "/admin";
        router.replace(`/staff/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setChecking(false);
    }).catch((cause) => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.code === "UNAUTHENTICATED" || cause.code === "FORBIDDEN")) {
        const next = pathname.startsWith("/admin") ? pathname : "/admin";
        router.replace(`/staff/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setError(cause instanceof ApiError ? cause.message : "Could not verify your staff session.");
      setChecking(false);
    });

    return () => { active = false; };
  }, [attempt, pathname, router]);

  if (checking) {
    return <div className="mx-auto max-w-5xl px-4 py-10"><LoadingState rows={3} label="Checking staff session" /></div>;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorState
          message={error}
          onRetry={() => {
            setChecking(true);
            setError(null);
            setAttempt((value) => value + 1);
          }}
        />
      </div>
    );
  }
  return children;
}
