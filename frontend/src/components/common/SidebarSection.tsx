import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

interface SidebarSectionProps {
  label: string;
  /** Shown greyed beside the label — how many rows are inside. */
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Rendered in place of `children` when the section is open but empty. */
  emptyLabel?: string;
}

/**
 * A collapsible group of sidebar rows under a small header — the note explorer's "Tags", the
 * diagram sidebar's "Diagrams" / "Folders".
 *
 * The header is deliberately quieter than a row: it is a label you fold, not something you open.
 */
const SidebarSection = ({ label, count, open, onToggle, children, emptyLabel }: SidebarSectionProps) => (
  <div className="mb-3">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center gap-x-1.5 rounded px-2 pb-1 caption-small-medium text-neutral-500 hover:text-neutral-300"
    >
      {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
      {label}
      <span className="text-neutral-600">{count}</span>
    </button>
    {open &&
      (count === 0 && emptyLabel !== undefined ? (
        <div className="px-2 py-1 caption-regular text-neutral-600">{emptyLabel}</div>
      ) : (
        children
      ))}
  </div>
);

export default SidebarSection;
