import type { PublicOrder } from "@/services/client";

type Callbacks<T> = {
  onStart: () => void;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  onFinish: () => void;
};

/** One current lookup; polling is single-flight and old identities cannot commit. */
export function createTrackingRequestCoordinator<T>(callbacks: Callbacks<T>) {
  let generation = 0;
  let active: number | null = null;
  return {
    async load(fetch: () => Promise<T>, options: { replace?: boolean } = {}) {
      if (active !== null && !options.replace) return;
      const request = ++generation;
      active = request;
      callbacks.onStart();
      try {
        const value = await fetch();
        if (request === generation) callbacks.onValue(value);
      } catch (error) {
        if (request === generation) callbacks.onError(error);
      } finally {
        if (request === generation) {
          active = null;
          callbacks.onFinish();
        }
      }
    },
    invalidate() {
      generation++;
      active = null;
    },
  };
}

export function isTrackingTerminal(order: Pick<PublicOrder, "fulfilmentStatus" | "trackingJourney">) {
  return ["delivered", "collected", "cancelled"].includes(order.fulfilmentStatus) ||
    ["delivered", "collected"].includes(order.trackingJourney?.state ?? "");
}
