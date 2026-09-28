import { useEffect, useState } from "react";
import { ApiError } from "../api";

/**
 * Minimal data-fetching hook. Every page uses this so loading, error and
 * empty states are handled the same way everywhere.
 */
export function useApi<T>(fn: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  // The caller owns the dependency list (see the `deps` argument), so the
  // linter cannot verify stability of `fn` and flags the reset below.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError
              ? e
              : new ApiError("BACKEND_ERROR", e instanceof Error ? e.message : String(e)),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
