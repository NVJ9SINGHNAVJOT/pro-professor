import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  HashIcon,
  NotebookTextIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import { toast } from "@/components/common/toast";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { removeNote, setNotes, type NoteListItem } from "@/redux/slices/notesSlice";
import { useApi } from "@/hooks/useApi";
import { notesRoute, type NoteSummary } from "@/services/operations/notes/notes.route";
import { SEARCH_DEBOUNCE_MS } from "@/modules/notes/constants";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

interface NoteListProps {
  onCreate: () => void;
  creating: boolean;
}

/**
 * Left pane — the note explorer: new-note button, search, a collapsible tag
 * browser (notes grouped per tag, Obsidian-style), and the flat note list.
 * The whole pane scrolls on its own, independent of the editor and context panel.
 */
const NoteList = ({ onCreate, creating }: NoteListProps) => {
  const notes = useAppSelector((state) => state.notes.notes);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const noteId = useParams().noteId;
  const [query, setQuery] = useState("");
  const [tagsOpen, setTagsOpen] = useState(true);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const { execute: fetchNotes } = useApi(notesRoute.getNotes);
  const { execute: deleteNote } = useApi(notesRoute.deleteNote);
  const { execute: searchNotes } = useApi(notesRoute.searchNotes);
  const [searchResults, setSearchResults] = useState<NoteSummary[] | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchNotes();
      if (!res.error) {
        dispatch(setNotes(res.response.data.notes));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server keyword search (Postgres FTS over title + content), debounced.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchNotes(q);
      if (!res.error) setSearchResults(res.response.data.notes);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Instant title/tag matches, merged with (ranked) server content matches once they arrive.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    const local = notes.filter(
      (note) => note.title.toLowerCase().includes(q) || note.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
    const merged = [...(searchResults ?? [])];
    local.forEach((note) => {
      if (!merged.some((m) => m.id === note.id)) merged.push(note);
    });
    return merged;
  }, [notes, query, searchResults]);

  // Tag browser data: tag → its notes, sorted by tag name.
  const notesByTag = useMemo(() => {
    const map = new Map<string, NoteListItem[]>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => map.set(tag, [...(map.get(tag) ?? []), note]));
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [notes]);

  const toggleTag = (tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await deleteNote(id);
    if (res.error) {
      toast.error("Failed to delete note");
      return;
    }
    dispatch(removeNote(id));
    if (noteId === String(id)) navigate(ROUTES.NOTES);
  };

  const noteEntry = (note: NoteSummary | NoteListItem, options?: { compact?: boolean }) => (
    <NavLink
      key={note.id}
      to={ROUTES.NOTES_DETAIL(note.id)}
      className={({ isActive }) =>
        cn("group flex flex-col gap-y-1 rounded-lg px-2 py-1.5 hover:bg-neutral-800", isActive && "bg-neutral-800")
      }
    >
      <div className="flex items-center justify-between gap-x-1">
        <span className="truncate para-small-medium">{note.title}</span>
        <button
          type="button"
          onClick={(e) => handleDelete(e, note.id)}
          aria-label="Delete note"
          className="shrink-0 cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2Icon className="size-4" />
        </button>
      </div>
      {!options?.compact && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-neutral-800 px-1.5 py-0.5 caption-small-regular text-neutral-400 group-hover:bg-neutral-700"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </NavLink>
  );

  const searching = query.trim().length > 0;

  return (
    <aside className="flex h-full w-67.5 shrink-0 flex-col gap-y-2 overflow-hidden border-r border-neutral-800 bg-chat-sidebar text-white">
      <LeftNav />
      {/* New note — shares the toolbar height for a uniform top band */}
      <div className="flex h-11.5 shrink-0 items-center px-2">
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="flex w-full cursor-pointer items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SquarePenIcon className="size-4.5" />
          New note
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-2">
        <div className="flex items-center gap-x-2 rounded-lg px-2 py-1.5 focus-within:bg-neutral-800/60 hover:bg-neutral-800/60">
          <SearchIcon className="size-4.5 shrink-0 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            className="w-full bg-transparent para-small-medium outline-none placeholder:text-neutral-500"
          />
        </div>
      </div>

      {/* Explorer body — scrolls independently of the editor and context panel */}
      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* Tag browser — collapsible tree of notes grouped by tag (hidden while searching) */}
        {!searching && notesByTag.length > 0 && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setTagsOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center gap-x-1.5 rounded px-2 pb-1 caption-small-medium text-neutral-500 hover:text-neutral-300"
            >
              {tagsOpen ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
              Tags
              <span className="text-neutral-600">{notesByTag.length}</span>
            </button>
            {tagsOpen &&
              notesByTag.map(([tag, tagNotes]) => (
                <div key={tag}>
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="flex w-full cursor-pointer items-center gap-x-1.5 rounded-lg px-2 py-1 para-small-medium text-neutral-300 hover:bg-neutral-800"
                  >
                    {expandedTags.has(tag) ? (
                      <ChevronDownIcon className="size-3.5 shrink-0 text-neutral-500" />
                    ) : (
                      <ChevronRightIcon className="size-3.5 shrink-0 text-neutral-500" />
                    )}
                    <HashIcon className="size-3.5 shrink-0 text-neutral-500" />
                    <span className="truncate">{tag}</span>
                    <span className="ml-auto caption-small-regular text-neutral-600">{tagNotes.length}</span>
                  </button>
                  {expandedTags.has(tag) && (
                    <div className="ml-4 border-l border-neutral-800 pl-1">
                      {tagNotes.map((note) => noteEntry(note, { compact: true }))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Flat note list, newest-edited first */}
        {!searching && (
          <div className="flex items-center gap-x-1.5 px-2 pb-1 caption-small-medium text-neutral-500">
            <NotebookTextIcon className="size-3.5" />
            Notes
          </div>
        )}
        {filtered.length === 0 && (
          <div className="px-2 caption-regular text-neutral-500">{searching ? "No notes found" : "No notes yet"}</div>
        )}
        <div className="flex flex-col gap-y-0.5">
          {filtered.map((note) => noteEntry(note))}
        </div>
      </div>
    </aside>
  );
};

export default NoteList;
