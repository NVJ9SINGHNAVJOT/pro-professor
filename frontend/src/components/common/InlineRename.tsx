import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface InlineRenameProps {
  /** The name being edited. Uncontrolled from here on — the field owns its text until it commits. */
  value: string;
  /** Enter or blur, with a trimmed, non-empty name that actually differs from `value`. */
  onCommit: (next: string) => void;
  /** Escape, or a blur/Enter that changed nothing. */
  onCancel: () => void;
  /**
   * Commit a value equal to `value` instead of cancelling. Renaming a row to the name it already
   * has is a no-op, but a *create* field opening on a suggested name ("Untitled 2") has to read
   * Enter as "yes, that one" — otherwise accepting the offered name does nothing at all.
   */
  commitUnchanged?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * Edits a row's name in place — sidebar rows, folder rows, explorer cards, and the placeholder row
 * a right-click "New …" opens (see `commitUnchanged`).
 *
 * Same contract as the editor top bar's `EditableTitle` one row up (Enter commits, Escape reverts),
 * but for a field that only exists while renaming, so it is uncontrolled and self-focusing.
 *
 * Two details that are easy to lose:
 *
 * - **It must not shift the row.** The row's label is a bare `<span>`, so any padding on the input
 *   would jump the text sideways the instant rename mode opens. `-mx-1 px-1` cancels out: the text
 *   stays put and the box grows into the row's own padding instead. The focus outline is a `ring`
 *   (a box-shadow), which takes no layout space either.
 * - **Focus is taken on mount, not by `autoFocus`.** The field is usually mounted by a context-menu
 *   action, and taking focus from an effect keeps that deterministic — it runs after the row has
 *   swapped its label for this field, whatever else is unmounting in the same commit.
 */
const InlineRename = ({ value, onCommit, onCancel, commitUnchanged, ariaLabel, className }: InlineRenameProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter commits and then blurs, and Escape cancels and then blurs — both would run the blur
  // handler a second time on a field that has already reported its outcome.
  const settled = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    // The whole name selected, so typing replaces it — how every file explorer opens a rename.
    input.select();
  }, []);

  const settle = (next: string) => {
    if (settled.current) return;
    settled.current = true;
    const trimmed = next.trim();
    // A blank name is a slip, not a rename: leave the row as it was.
    if (trimmed === "" || (trimmed === value && !commitUnchanged)) onCancel();
    else onCommit(trimmed);
  };

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      spellCheck={false}
      aria-label={ariaLabel}
      // The row underneath is a link, a button, or a folder toggle — none of which should react to
      // the clicks that place the caret.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => settle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") settle(e.currentTarget.value);
        if (e.key === "Escape") {
          settled.current = true;
          onCancel();
        }
      }}
      className={cn(
        "-mx-1 min-w-0 flex-1 rounded bg-neutral-950 px-1 para-small-medium text-white outline-none ring-1 ring-neutral-700",
        className,
      )}
    />
  );
};

export default InlineRename;
