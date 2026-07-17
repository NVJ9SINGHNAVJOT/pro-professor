import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaletteCommand {
  id: string;
  label: string;
  /** Small right-aligned context, e.g. a section name. */
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

/**
 * Obsidian-style Cmd/Ctrl+P palette — hand-rolled dialog (no cmdk dependency):
 * type to filter, ↑/↓ to select, Enter to run, Esc to close.
 */
const CommandPalette = ({ open, onClose, commands }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  // fresh state + focus each time it opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // keep the selected row in view while arrowing through a long list
  useEffect(() => {
    listRef.current?.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  const runCommand = (command: PaletteCommand) => {
    onClose();
    command.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) runCommand(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onKeyDown={handleKeyDown}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-[34rem] max-w-[90vw] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="flex items-center gap-x-2 border-b border-neutral-800 px-3 py-2.5">
          <SearchIcon className="size-4 shrink-0 text-neutral-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or note title…"
            className="w-full bg-transparent para-small-medium text-white outline-none placeholder:text-neutral-500"
          />
          <kbd className="shrink-0 rounded border border-neutral-700 px-1.5 py-0.5 caption-small-regular text-neutral-500">
            esc
          </kbd>
        </div>
        <ul ref={listRef} className="chat-scroll max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <li className="px-2.5 py-2 caption-regular text-neutral-500">No matching commands</li>
          )}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                onClick={() => runCommand(command)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-x-2.5 rounded-lg px-2.5 py-2 text-left para-small-medium text-neutral-200",
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
    </div>
  );
};

export default CommandPalette;
