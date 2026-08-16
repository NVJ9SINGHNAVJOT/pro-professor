import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** The panel's content — anything clicked in here leaves the modal open. */
  children: ReactNode;
  /** Shown in a header row above the content; omit for a bare panel (e.g. the search palette). */
  title?: string;
  description?: string;
  /** Width utility for the panel, e.g. `w-256`. */
  className?: string;
  /** "center" (default) or "top" for palette-style dialogs that sit high on the screen. */
  align?: "center" | "top";
  /** Hide the ✕ when the content offers its own way out. */
  showClose?: boolean;
}

/**
 * The app's one dialog shell: a dimmed backdrop, a centered (or top-aligned) panel, and the two
 * ways out every modal should have — the ✕ and a click on the backdrop. Escape closes it too.
 *
 * Rendered through a portal on `document.body`, so a modal opened from deep inside a screen (the
 * chat settings gear) is never clipped or stacked under its parent's overflow/z-index. The
 * backdrop is a real element rather than a document-level outside-click listener, which is what
 * lets portalled dropdowns (Radix selects) be used *inside* a modal: clicking an option lands in
 * that dropdown's own portal, never on this backdrop, so the modal stays open.
 *
 * Content scrolls inside the panel, which never exceeds 85vh.
 */
const Modal = ({
  open,
  onClose,
  children,
  title,
  description,
  className,
  align = "center",
  showClose = true,
}: ModalProps) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center",
        align === "top" ? "items-start pt-[15vh]" : "items-center py-10",
      )}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[80vh] w-300 max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl",
          className,
        )}
      >
        {title ? (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-800 px-6 py-4">
            <div className="min-w-0">
              <h2 className="truncate para-medium-semibold text-white">{title}</h2>
              {description && <p className="mt-0.5 caption-small-regular text-neutral-400">{description}</p>}
            </div>
            {showClose && <CloseButton onClose={onClose} />}
          </div>
        ) : (
          showClose && (
            <div className="absolute right-3 top-3 z-10">
              <CloseButton onClose={onClose} />
            </div>
          )
        )}

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <button
    type="button"
    onClick={onClose}
    aria-label="Close"
    className="shrink-0 cursor-pointer rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
  >
    <XIcon className="size-4.5" />
  </button>
);

export default Modal;
