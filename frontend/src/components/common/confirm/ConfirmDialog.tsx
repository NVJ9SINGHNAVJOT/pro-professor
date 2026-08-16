import { useEffect, useState } from "react";
import Button from "@/components/common/Button";
import { getConfirm, resolveConfirm, subscribe, type ConfirmRequest } from "./store";

/**
 * The one dialog `confirm()` opens, mounted once beside the `Toaster`.
 *
 * It **takes focus**, unlike `SidebarRowMenu` — a destructive answer shouldn't be a stray Enter in
 * whatever was focused before. Focus lands on Cancel, so the safe answer is the default one, and
 * Escape or a backdrop click answers `false` too.
 *
 * The panel is keyed by request id so a dialog replacing an open one remounts and re-runs that
 * `autoFocus`, rather than leaving focus on the button the previous panel had.
 */
export function ConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(getConfirm);

  useEffect(() => subscribe(setRequest), []);

  if (request === null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={request.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          resolveConfirm(false);
        }
      }}
      className="fixed inset-0 z-110 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/60" onClick={() => resolveConfirm(false)} />

      <div
        key={request.id}
        className="relative w-104 max-w-[90vw] rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
      >
        <p className="para-semibold text-white wrap-break-word">{request.title}</p>
        <p className="para-small-regular mt-2 text-neutral-400 wrap-break-word">{request.message}</p>

        <div className="mt-5 flex justify-end gap-x-2">
          <Button autoFocus variant="secondary" onClick={() => resolveConfirm(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => resolveConfirm(true)}
            className={request.destructive ? "bg-red-600 text-white hover:bg-red-500" : undefined}
          >
            {request.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
