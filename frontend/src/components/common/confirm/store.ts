export interface ConfirmOptions {
  title: string;
  /** The consequence, spelled out — a cascade should say what it takes with it. */
  message: string;
  /** The affirmative button's label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Styles the affirmative button as destructive. */
  destructive?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
}

let counter = 0;
let pending: ConfirmRequest | null = null;
let settle: ((confirmed: boolean) => void) | null = null;
const listeners = new Set<(request: ConfirmRequest | null) => void>();

function emit() {
  for (const listener of listeners) listener(pending);
}

/**
 * Asks the user to confirm, resolving to their answer.
 *
 * Imperative like `toast` rather than a rendered `<Modal open={…}>`, because the callers are async
 * mutation handlers, not components — `deleteFolder` needs a `await confirm(...)` it can bail out
 * of, and threading open/callback state through the three surfaces that can start a delete would
 * mean the same dialog wired up three times.
 *
 * One at a time: a second call while a dialog is open answers the first with `false` and replaces
 * it, so no caller is left waiting on a promise that can never settle.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  settle?.(false);
  return new Promise<boolean>((resolve) => {
    pending = { ...options, id: ++counter };
    settle = resolve;
    emit();
  });
}

/** Answers the open dialog. Called by the host on a button, on Escape, and on a backdrop click. */
export function resolveConfirm(confirmed: boolean) {
  const resolve = settle;
  pending = null;
  settle = null;
  emit();
  resolve?.(confirmed);
}

export function getConfirm() {
  return pending;
}

export function subscribe(listener: (request: ConfirmRequest | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
