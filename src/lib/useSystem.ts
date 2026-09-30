import { api, SYSTEM_PARAMS } from "../api";
import type { SystemResponse } from "../api";
import { useApi } from "./useApi";

/**
 * GET /api/system, fetched once per page load and shared. The backend owns
 * every displayed constant; the compile-time SYSTEM_PARAMS only bridges the
 * first render and a backend that predates /api/system.
 */

const FALLBACK_PARAMS: SystemResponse["params"] = {
  ...SYSTEM_PARAMS,
  verifierNames: [...SYSTEM_PARAMS.verifierNames],
};

let cached: Promise<SystemResponse> | null = null;
const fetchSystem = () =>
  (cached ??= api.getSystem().catch((e) => {
    cached = null; // let a later mount retry
    throw e;
  }));

export function useSystem() {
  const { data, error, loading } = useApi(() => fetchSystem(), []);
  return {
    system: data,
    /** always usable: backend params once loaded, compile-time fallback before */
    params: data?.params ?? FALLBACK_PARAMS,
    error,
    loading,
  };
}
