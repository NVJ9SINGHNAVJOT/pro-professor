/**
 * The app's only use of `localStorage`. Everything else is either server state (route loaders) or
 * session state (Redux, component state) — this exists solely for **view preferences that have to
 * survive a hard refresh**: the notes graph view (`redux/slices/notesGraphSlice.ts`) and the
 * storage browser's card size (`modules/settings/components/StoragePanel.tsx`).
 *
 * Every access is wrapped: `localStorage` throws outright in Safari's private mode, when storage is
 * disabled by enterprise policy, and on quota. Losing a preference is never worth taking the app
 * down, so a failed read returns null and a failed write is dropped.
 */

/** Reads and parses a key. Returns null when storage is unavailable, the key is unset, or the JSON is corrupt. */
export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null; // the caller's default wins
  }
}

/**
 * Writes a key once, now. For preferences that change at click rate — a view-size switch — where
 * the throttling below would only add latency. Same swallow-everything contract as `readJson`: a
 * preference is never worth an exception.
 */
export function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage disabled, or over quota — the preference simply doesn't persist this session
  }
}

/**
 * A writer that coalesces a burst of changes into one write per `intervalMs` and flushes on the way
 * out. State that changes at gesture rate (the graph's camera moves on every wheel tick) must not
 * hit `localStorage` — it is synchronous and blocks the main thread.
 *
 * The flush hooks are `pagehide` + `visibilitychange`, **not** `beforeunload`: Chrome fires that one
 * unreliably, so a reload straight after a change would lose it.
 */
export function createThrottledWriter(key: string, intervalMs: number) {
  let pending: unknown;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let lastWritten: string | null = null;

  const flush = () => {
    timer = null;
    if (pending === undefined) return;
    try {
      const serialized = JSON.stringify(pending);
      // Callers dispatch far more often than they change anything that is actually persisted —
      // typing in a filter box rewrites the slice on every keystroke while the saved payload is
      // identical. `setItem` is synchronous, so skipping a no-op write is worth the compare.
      if (serialized !== lastWritten) {
        window.localStorage.setItem(key, serialized);
        lastWritten = serialized;
      }
    } catch {
      // storage disabled, or over quota — the preference simply doesn't persist this session
    }
    pending = undefined;
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  return (value: unknown) => {
    pending = value;
    // A fixed window from the *first* pending write — a throttle, not a debounce, so a continuous
    // gesture still checkpoints instead of only landing when it stops.
    timer ??= setTimeout(flush, intervalMs);
  };
}
