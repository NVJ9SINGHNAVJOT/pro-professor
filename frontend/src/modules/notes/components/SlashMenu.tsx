import { useEffect, useMemo, useRef, useState } from "react";
import { SLASH_COMMANDS, type SlashCommand } from "@/modules/notes/constants";
import { cn } from "@/lib/utils";

interface SlashMenuProps {
  /** Popover position inside the (relative) editor wrapper; null = closed. */
  anchor: { top: number; left: number } | null;
  /** What was typed after the `/` — filters the block list. */
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

/**
 * Caret-anchored `/` block menu (see NotesScreen for the trigger detection).
 * The textarea keeps focus; a capture-phase key listener steals ↑/↓/Enter/Esc
 * while the menu is open so navigation never reaches the editor.
 */
const SlashMenu = ({ anchor, query, onSelect, onClose }: SlashMenuProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((command) => `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, anchor]);

  // keep the selected row in view while arrowing
  useEffect(() => {
    listRef.current?.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // latest handlers for the capture listener without re-registering (saveRef pattern)
  const stateRef = useRef({ filtered, selectedIndex, onSelect, onClose });
  useEffect(() => {
    stateRef.current = { filtered, selectedIndex, onSelect, onClose };
  });

  const open = anchor !== null;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const { filtered: items, selectedIndex: index, onSelect: select, onClose: close } = stateRef.current;
      if (e.key === "ArrowDown") {
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (!items[index]) {
          close();
          return;
        }
        select(items[index]);
      } else if (e.key === "Escape") {
        close();
      } else {
        return; // every other key types into the textarea as usual
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!anchor) return null;

  return (
    <div
      className="absolute z-40 w-88 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <ul ref={listRef} className="chat-scroll max-h-64 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <li className="px-2.5 py-2 caption-small-regular text-neutral-500">No matching blocks</li>
        )}
        {filtered.map((command, index) => (
          <li key={command.id}>
            <button
              type="button"
              // mousedown would blur the textarea and tear down the slash context
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(command)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-x-2.5 rounded-lg px-2.5 py-1.5 text-left para-small-medium text-neutral-200",
                index === selectedIndex && "bg-neutral-800 text-white",
              )}
            >
              <command.icon className="size-4 shrink-0 text-neutral-400" />
              <span className="truncate">{command.label}</span>
              {command.hint && (
                <span className="ml-auto shrink-0 caption-small-regular text-neutral-500">{command.hint}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SlashMenu;
