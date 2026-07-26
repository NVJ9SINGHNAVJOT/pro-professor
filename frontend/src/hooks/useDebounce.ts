import { useEffect, useRef } from "react";

/**
 * Fires `callback` after the caller stops updating `value` for `delayMs`.
 * The callback is skipped entirely when `value` is empty/whitespace — if an
 * `onEmpty` handler is supplied it runs synchronously instead (useful for
 * clearing previous results).
 *
 * @param value     The value to debounce on (typically user input).
 * @param callback  Called with the trimmed value after the delay.
 * @param delayMs   Debounce window in milliseconds.
 * @param onEmpty   Optional handler invoked immediately when `value` is empty.
 */
export function useDebounce(value: string, callback: (trimmed: string) => void, delayMs: number, onEmpty?: () => void) {
  // Keep callbacks ref-stable so callers don't need to memoise them.
  const callbackRef = useRef(callback);
  const onEmptyRef = useRef(onEmpty);
  useEffect(() => {
    callbackRef.current = callback;
    onEmptyRef.current = onEmpty;
  });

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onEmptyRef.current?.();
      return;
    }

    const timer = setTimeout(() => callbackRef.current(trimmed), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
}
