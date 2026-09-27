function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Abortable sleep. `speed` is a live getter so a fast-forward control can
 * shorten the *remaining* wait without restarting the step.
 */
export function sleep(
  ms: number,
  opts: { signal?: AbortSignal; speed?: () => number } = {},
): Promise<void> {
  const scaled = Math.max(0, ms * (opts.speed?.() ?? 1));
  if (scaled === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());
    const timer = setTimeout(done, scaled);

    function done() {
      opts.signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }

    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}
