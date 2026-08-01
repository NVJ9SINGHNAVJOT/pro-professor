import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FileTextIcon, MessageSquareIcon, SearchIcon } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { chatsRoute } from "@/services/operations/chats/chats.route";
import { notesRoute } from "@/services/operations/notes/notes.route";
import { ROUTES } from "@/constants/routes";
import { SEARCH_DEBOUNCE_MS } from "@/constants/ui";
import { cn } from "@/lib/utils";

interface Hit {
  key: string;
  kind: "note" | "chat";
  title: string;
  /** Matching excerpt for a chat; the tag line for a note. Blank when there's nothing to add. */
  detail: string;
  to: string;
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The app's one search surface, opened with ⌘K from anywhere.
 *
 * Both explorers used to carry their own input, which meant chat could only filter the titles it
 * had already loaded while notes ran a real server query — two different behaviours behind two
 * identical-looking boxes. This runs the same Postgres full-text search over both
 * (`GET /notes/search`, `GET /chats/search`) and lists the results together, so "where did I write
 * that" has one answer regardless of where it was written.
 *
 * Hand-rolled overlay, matching the notes command palette — this repo has no generic Modal.
 */
const SearchModal = ({ open, onClose }: SearchModalProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notes, setNotes] = useState<Hit[]>([]);
  const [chats, setChats] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const { execute: searchNotes } = useApi(notesRoute.searchNotes);
  const { execute: searchChats } = useApi(chatsRoute.searchChats);

  useDebounce(
    query,
    async (q) => {
      setSearching(true);
      // Both tiers are local; running them together keeps the list from filling in twice.
      const [noteRes, chatRes] = await Promise.all([searchNotes(q), searchChats(q)]);
      if (!noteRes.error) {
        setNotes(
          noteRes.response.data.notes.map((note) => ({
            key: `note-${note.id}`,
            kind: "note" as const,
            title: note.title,
            detail: note.tags.map((tag) => `#${tag}`).join(" "),
            to: ROUTES.NOTES_DETAIL(note.id),
          })),
        );
      }
      if (!chatRes.error) {
        setChats(
          chatRes.response.data.results.map((hit) => ({
            key: `chat-${hit.id}`,
            kind: "chat" as const,
            title: hit.title ?? "Untitled chat",
            detail: hit.snippet,
            to: ROUTES.CHAT_DETAIL(hit.id),
          })),
        );
      }
      setSearching(false);
    },
    SEARCH_DEBOUNCE_MS,
    () => {
      // Query cleared — drop both lists rather than leaving stale hits under an empty box.
      setNotes([]);
      setChats([]);
      setSearching(false);
    },
  );

  // Notes first: a note is a thing you went looking for, a chat is usually where you said it.
  const hits = useMemo(() => [...notes, ...chats], [notes, chats]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    setNotes([]);
    setChats([]);
    // Focus after paint — the input doesn't exist until this render commits.
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  const openHit = (hit: Hit) => {
    onClose();
    navigate(hit.to);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[selectedIndex]) openHit(hits[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const typed = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-[38rem] max-w-[90vw] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="flex items-center gap-x-2 border-b border-neutral-800 px-3 py-2.5">
          <SearchIcon className="size-4 shrink-0 text-neutral-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes and chats…"
            className="w-full bg-transparent para-small-medium text-white outline-none placeholder:text-neutral-500"
          />
          {searching && (
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
          )}
          <kbd className="shrink-0 rounded border border-neutral-700 px-1.5 py-0.5 caption-small-regular text-neutral-500">
            esc
          </kbd>
        </div>

        <ul ref={listRef} className="chat-scroll max-h-96 overflow-y-auto p-1.5">
          {!typed && (
            <li className="px-2.5 py-2 caption-regular text-neutral-500">
              Search the full text of every note and chat.
            </li>
          )}
          {typed && !searching && hits.length === 0 && (
            <li className="px-2.5 py-2 caption-regular text-neutral-500">No matches</li>
          )}
          {hits.map((hit, index) => (
            <li key={hit.key}>
              <button
                type="button"
                onClick={() => openHit(hit)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-x-2.5 rounded-lg px-2.5 py-2 text-left",
                  index === selectedIndex && "bg-neutral-800",
                )}
              >
                {hit.kind === "note" ? (
                  <FileTextIcon className="mt-0.5 size-4 shrink-0 text-emerald-400/80" />
                ) : (
                  <MessageSquareIcon className="mt-0.5 size-4 shrink-0 text-sky-400/80" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate para-small-medium text-neutral-100">{hit.title}</span>
                  {hit.detail && <span className="truncate caption-small-regular text-neutral-500">{hit.detail}</span>}
                </span>
                <span className="shrink-0 caption-small-regular text-neutral-600">
                  {hit.kind === "note" ? "Note" : "Chat"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SearchModal;
