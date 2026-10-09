"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/services/client";

/** Shared data hook with loading/error/reload for admin pages. */
export function useApiData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loaderRef.current());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The operation failed — the service reported an error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, deps);

  return { data, loading, error, reload: load, setData };
}
