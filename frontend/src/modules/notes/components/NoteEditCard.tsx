import { memo, useMemo } from "react";
import {
  ArrowDownToLineIcon,
  CheckIcon,
  CrosshairIcon,
  FileTextIcon,
  ReplaceIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { collapseUnchanged, diffLines } from "@/modules/notes/ai/diffLines";
import { lineNumberAt, locateEdit } from "@/modules/notes/ai/locateEdit";
import type { NoteEdit } from "@/modules/notes/ai/noteEdits";
import type { NoteEditStatus } from "@/modules/notes/types";
import { cn } from "@/lib/utils";

interface NoteEditCardProps {
  edit: NoteEdit;
  status: NoteEditStatus;
  /**
   * The buffer as it stood when the turn was sent. A snapshot, not the live value: this component
   * sits in a thread that must not re-render on every keystroke. Accepting re-finds the target
   * against the *live* buffer, so a stale line number here never causes a wrong write.
   */
  baseContent: string;
  onAccept: () => void;
  onReject: () => void;
  /** Selects this edit's target in the editor, so you can see where it lands before accepting. */
  onLocate: () => void;
}

const STATUS_LABEL: Record<Exclude<NoteEditStatus, "pending">, string> = {
  accepted: "Applied",
  rejected: "Rejected",
  stale: "The text this edit targeted has changed — nothing was written",
};

/**
 * One proposed change, as a diff you accept or reject.
 *
 * The card is the whole review step — there is no staging pane and nothing reaches the note until
 * Accept is clicked. Diff rows never wrap: a long line scrolls inside the card, because a Markdown
 * line reflowed across four rows stops reading as a diff.
 */
const NoteEditCard = memo(function NoteEditCard({
  edit,
  status,
  baseContent,
  onAccept,
  onReject,
  onLocate,
}: NoteEditCardProps) {
  const { rows, heading, Icon, missing } = useMemo(() => {
    if (edit.op === "append") {
      return {
        rows: collapseUnchanged(diffLines("", edit.text)),
        heading: "Add to the end",
        Icon: ArrowDownToLineIcon,
        missing: false,
      };
    }
    if (edit.op === "rewrite") {
      return {
        rows: collapseUnchanged(diffLines(baseContent, edit.text)),
        heading: "Rewrite the whole note",
        Icon: FileTextIcon,
        missing: false,
      };
    }
    const at = locateEdit(baseContent, edit.find);
    return {
      rows: collapseUnchanged(diffLines(edit.find, edit.replace)),
      heading: at === null ? "Replace" : `Replace · line ${lineNumberAt(baseContent, at.start)}`,
      Icon: ReplaceIcon,
      missing: at === null,
    };
  }, [edit, baseContent]);

  const settled = status !== "pending";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900",
        settled && "opacity-60",
        status === "stale" && "border-amber-400/40",
      )}
    >
      <button
        type="button"
        onClick={onLocate}
        title="Show where this lands in the note"
        className="group flex w-full cursor-pointer items-center gap-x-1.5 border-b border-neutral-800 px-2.5 py-1.5 text-left"
      >
        <Icon className="size-3.5 shrink-0 text-neutral-400" />
        <span className="min-w-0 flex-1 truncate caption-small-medium text-neutral-300">{heading}</span>
        <CrosshairIcon className="size-3.5 shrink-0 text-neutral-600 group-hover:text-neutral-300" />
      </button>

      {/* Rows wrap rather than scroll sideways: a note is mostly prose, and in a rail this wide
          almost every line would otherwise be cut off mid-word. The sign sits in its own column so
          a wrapped continuation still reads as part of its line. */}
      <div className="chat-scroll max-h-80 overflow-y-auto py-1 font-mono text-[11px] leading-relaxed">
        {rows.map((row, index) =>
          row.type === "gap" ? (
            <div key={index} className="px-2.5 py-0.5 text-neutral-600 select-none">
              ⋯ {row.hidden} unchanged {row.hidden === 1 ? "line" : "lines"}
            </div>
          ) : (
            <div
              key={index}
              className={cn(
                "flex gap-x-1 px-2.5",
                row.type === "add" && "bg-green-400/10 text-green-300",
                row.type === "del" && "bg-red-400/10 text-red-300",
                row.type === "same" && "text-neutral-500",
              )}
            >
              <span className="w-2 shrink-0 select-none">
                {row.type === "add" ? "+" : row.type === "del" ? "-" : " "}
              </span>
              <span className="min-w-0 flex-1 wrap-break-word whitespace-pre-wrap">{row.text || " "}</span>
            </div>
          ),
        )}
      </div>

      {/* The one place an edit can reach the note. Applying leaves the buffer dirty, so ⌘Z still
          walks it back and saving stays the user's call. */}
      {status === "pending" ? (
        <div className="flex items-center gap-x-1 border-t border-neutral-800 p-1.5">
          {missing && (
            <span
              title="This text wasn't in the note when the model was asked. Accepting will look for it again."
              className="shrink-0 px-1 text-amber-400"
            >
              <TriangleAlertIcon className="size-3.5" />
            </span>
          )}
          <CardAction label="Accept" icon={CheckIcon} onClick={onAccept} primary />
          <CardAction label="Reject" icon={XIcon} onClick={onReject} />
        </div>
      ) : (
        <div
          className={cn(
            "border-t border-neutral-800 px-2.5 py-1.5 caption-small-medium",
            status === "stale" ? "text-amber-400" : "text-neutral-500",
          )}
        >
          {STATUS_LABEL[status]}
        </div>
      )}
    </div>
  );
});

const CardAction = ({
  label,
  icon: Icon,
  onClick,
  primary,
}: {
  label: string;
  icon: typeof CheckIcon;
  onClick: () => void;
  primary?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-1 cursor-pointer items-center justify-center gap-x-1.5 rounded-md px-2 py-1 caption-small-medium transition-colors",
      primary ? "bg-white text-black hover:bg-neutral-200" : "text-neutral-400 hover:bg-neutral-800 hover:text-white",
    )}
  >
    <Icon className="size-3.5 shrink-0" />
    {label}
  </button>
);

export default NoteEditCard;
