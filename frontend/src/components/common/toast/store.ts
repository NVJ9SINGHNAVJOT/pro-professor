export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  description?: string;
  duration?: number;
}

export interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
}

const DEFAULT_DURATION = 4000;

let counter = 0;
let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const listener of listeners) listener(items);
}

function add(type: ToastType, title: string, options?: ToastOptions) {
  const id = ++counter;
  items = [
    ...items,
    {
      id,
      type,
      title,
      description: options?.description,
      duration: options?.duration ?? DEFAULT_DURATION,
    },
  ];
  emit();
  return id;
}

export function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function getToasts() {
  return items;
}

export function subscribe(listener: (items: ToastItem[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const toast = {
  success: (title: string, options?: ToastOptions) => add("success", title, options),
  error: (title: string, options?: ToastOptions) => add("error", title, options),
  info: (title: string, options?: ToastOptions) => add("info", title, options),
  warning: (title: string, options?: ToastOptions) => add("warning", title, options),
  dismiss,
};
