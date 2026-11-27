"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/services/client";
import { CACHE_INVALIDATED_EVENT } from "@/services/adapters/browser";

/** Shared data hook with loading/error/reload for admin pages. */
export function useApiData<T>(loader: () => Promise<T>, deps: unknown[] = [], options?: { refreshMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const requestVersion = useRef(0);
  const activeRequest = useRef(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshMs = options?.refreshMs;

  const load = useCallback(async (background = false) => {
    if (background && activeRequest.current) return;
    const version = ++requestVersion.current;
    activeRequest.current = true;
    if (!background) setLoading(true);
    setError(null);
    try {
      const value = await loaderRef.current();
      if (version === requestVersion.current) { setData(value); setLastUpdated(new Date()); }
    } catch (e) {
      if (version === requestVersion.current) setError(e instanceof ApiError ? e.message : "The operation failed — the service reported an error.");
    } finally {
      if (version === requestVersion.current) { activeRequest.current = false; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    load();
  }, deps);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(CACHE_INVALIDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(CACHE_INVALIDATED_EVENT, refresh);
      requestVersion.current++;
      activeRequest.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!refreshMs || !Number.isFinite(refreshMs) || refreshMs < 5000) return;
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, refreshMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshMs, load]);
  const reload = useCallback(() => load(), [load]);
  return { data, loading, error, reload, setData, lastUpdated };
}
