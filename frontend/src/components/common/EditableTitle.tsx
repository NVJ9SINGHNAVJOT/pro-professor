import { useRef } from "react";

interface EditableTitleProps {
  /** The working text — the parent owns it, so it can ride along on a draft's first save. */
  value: string;
  /** The last persisted title: what Escape reverts to, and what a commit is measured against. */
  savedValue: string;
  onChange: (next: string) => void;
  /** Enter or blur, with a trimmed, non-empty title that actually differs from `savedValue`. */
  onCommit: (next: string) => void;
  placeholder: string;
}

/**
 * The document title in an editor's top bar — notes and diagrams share it.
 *
 * Renaming is its own operation, not part of the document's save: typing changes nothing until
 * **Enter** (or leaving the field) commits it, and **Escape** puts the old title back. Same
 * interaction as the sidebar's inline folder rename, one row up.
 */
const EditableTitle = ({ value, savedValue, onChange, onCommit, placeholder }: EditableTitleProps) => {
  // Escape reverts through `onChange`, whose new value the blur that follows can't see yet — this
  // tells it to stay out of the way rather than commit the text it still has.
  const reverting = useRef(false);

  const commit = () => {
    if (reverting.current) {
      reverting.current = false;
      return;
    }
    const next = value.trim();
    // A blank title is a slip, not a rename: put back the one that's on the row.
    if (next === "") {
      onChange(savedValue);
      return;
    }
    if (next !== savedValue) onCommit(next);
    else if (next !== value) onChange(next);
  };

  return (
    <input
      value={value}
      spellCheck={false}
      aria-label="Title"
      onChange={(e) => onChange(e.target.value)}
      // Enter only leaves the field — blur is the single commit path, so it can't fire twice.
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          reverting.current = true;
          onChange(savedValue);
          e.currentTarget.blur();
        }
      }}
      onBlur={commit}
      className="min-w-0 flex-1 truncate bg-transparent para-medium-semibold outline-none"
      placeholder={placeholder}
    />
  );
};

export default EditableTitle;
