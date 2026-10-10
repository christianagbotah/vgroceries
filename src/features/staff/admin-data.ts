"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/services/client";
import { CACHE_INVALIDATED_EVENT } from "@/services/adapters/browser";

/** Shared data hook with loading/error/reload for admin pages. */
export function useApiData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const value = await loaderRef.current();
      if (version === requestVersion.current) setData(value);
    } catch (e) {
      if (version === requestVersion.current) setError(e instanceof ApiError ? e.message : "The operation failed — the service reported an error.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
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
    };
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
