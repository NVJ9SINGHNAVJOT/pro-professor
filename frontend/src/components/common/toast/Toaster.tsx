import { useEffect, useState } from "react";
import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dismiss, getToasts, subscribe, type ToastItem, type ToastType } from "./store";

const icons: Record<ToastType, { Icon: typeof InfoIcon; className: string }> = {
  success: { Icon: CircleCheckIcon, className: "text-emerald-400" },
  error: { Icon: OctagonXIcon, className: "text-red-400" },
  info: { Icon: InfoIcon, className: "text-blue-400" },
  warning: { Icon: TriangleAlertIcon, className: "text-amber-400" },
};

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration]);

  const { Icon, className } = icons[item.type];

  return (
    <div className="pointer-events-auto flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-white shadow-lg animate-in fade-in slide-in-from-bottom-2">
      <Icon className={cn("mt-px size-4 shrink-0", className)} />
      <div className="min-w-0 flex-1">
        <p className="para-small-semibold wrap-break-word">{item.title}</p>
        {item.description && (
          <p className="para-small-regular mt-0.5 text-neutral-400 wrap-break-word">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(item.id)}
        className="shrink-0 text-neutral-500 transition-colors hover:text-neutral-200"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>(getToasts);

  useEffect(() => subscribe(setToasts), []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-100 flex flex-col gap-2">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
