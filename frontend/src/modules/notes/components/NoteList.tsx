import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, HashIcon, SearchIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router";
import LeftNav from "@/components/common/LeftNav";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import SidebarSection from "@/components/common/SidebarSection";
import { SIDEBAR_LIST, SIDEBAR_ROW_WRAPPER, sidebarRow } from "@/components/common/sidebarRow";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useAppDispatch } from "@/redux/store";
import { removeNote } from "@/redux/slices/notesListSlice";
import { notesRoute, type NoteSummary } from "@/services/operations/notes/notes.route";
import { SEARCH_DEBOUNCE_MS } from "@/modules/notes/constants";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

interface NoteListProps {
  /** The explorer list, loaded by the parent `/notes` route. */
  notes: NoteSummary[];
  onCreate: () => void;
  creating: boolean;
  /**
   * Collapsed, the pane animates to zero width. NotesScreen owns the state and renders the toggle
   * in the center pane's top bar — a control inside here would collapse along with it.
   */
  isOpen: boolean;
}

/**
 * Left pane — the note explorer: new-note button, search, a collapsible tag
 * browser (notes grouped per tag, Obsidian-style), and the flat note list.
 * The whole pane scrolls on its own, independent of the editor and context panel.
 */
const NoteList = ({ notes, onCreate, creating, isOpen }: NoteListProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const noteId = useParams().noteId;
  const [query, setQuery] = useState("");
  const [tagsOpen, setTagsOpen] = useState(true);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const { execute: deleteNote } = useApi(notesRoute.deleteNote);
  const { execute: searchNotes } = useApi(notesRoute.searchNotes);
  const [searchResults, setSearchResults] = useState<NoteSummary[] | null>(null);

  // Server keyword search (Postgres FTS over title + content), debounced.
  useDebounce(
    query,
    async (q) => {
      const res = await searchNotes(q);
      if (!res.error) setSearchResults(res.response.data.notes);
    },
    SEARCH_DEBOUNCE_MS,
    () => setSearchResults(null),
  );

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
    const map = new Map<string, NoteSummary[]>();
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

  const handleDelete = async (id: number) => {
    const res = await deleteNote(id);
    if (res.error) {
      toast.error("Failed to delete note");
      return;
    }
    dispatch(removeNote(id));
    if (noteId === String(id)) navigate(ROUTES.NOTES);
  };

  const noteEntry = (note: NoteSummary, options?: { compact?: boolean }) => (
    <SidebarRowMenu
      key={note.id}
      label={note.title}
      actions={[{ label: "Delete", icon: Trash2Icon, destructive: true, onSelect: () => handleDelete(note.id) }]}
    >
      <div className={SIDEBAR_ROW_WRAPPER}>
        <NavLink
          to={ROUTES.NOTES_DETAIL(note.id)}
          // Re-navigating to the note we're already on reads as a revalidation and refetches the
          // explorer, so swallow that click.
          onClick={(e) => noteId === String(note.id) && e.preventDefault()}
          // Tags stack under the title, so this row is a column — the one place the shared row
          // deviates, hence `flex-col items-start`.
          className={({ isActive }) => sidebarRow(isActive, "flex-col items-start gap-y-1")}
        >
          <span className="w-full truncate">{note.title}</span>
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
      </div>
    </SidebarRowMenu>
  );

  const searching = query.trim().length > 0;

  return (
    // Two elements, as in the chat sidebar: the outer one animates its width, the inner one keeps
    // the full width so the content doesn't reflow on its way out — it fades instead.
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden bg-chat-sidebar text-white transition-all duration-300 ease-in-out",
        isOpen ? "w-67.5 border-r border-neutral-800" : "w-0",
      )}
    >
      <div
        className={cn(
          "flex h-full w-67.5 flex-col gap-y-2 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0",
        )}
      >
        <LeftNav />
        {/* New note — shares the toolbar height for a uniform top band */}
        <div className="flex h-11.5 shrink-0 items-center px-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="flex w-full cursor-pointer items-center gap-x-3 rounded-lg px-2 py-2 para-small-medium hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SquarePenIcon className="size-4.5 shrink-0" />
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
            <SidebarSection
              label="Tags"
              count={notesByTag.length}
              open={tagsOpen}
              onToggle={() => setTagsOpen((open) => !open)}
            >
              <div className={SIDEBAR_LIST}>
                {notesByTag.map(([tag, tagNotes]) => (
                  <div key={tag}>
                    <button type="button" onClick={() => toggleTag(tag)} className={sidebarRow(false, "gap-x-1.5")}>
                      {expandedTags.has(tag) ? (
                        <ChevronDownIcon className="size-4 shrink-0 text-neutral-500" />
                      ) : (
                        <ChevronRightIcon className="size-4 shrink-0 text-neutral-500" />
                      )}
                      <HashIcon className="size-4 shrink-0 text-neutral-400" />
                      <span className="truncate">{tag}</span>
                      <span className="ml-auto caption-small-regular text-neutral-600">{tagNotes.length}</span>
                    </button>
                    {expandedTags.has(tag) && (
                      <div className={cn("ml-4 mt-1 border-l border-neutral-800 pl-1", SIDEBAR_LIST)}>
                        {tagNotes.map((note) => noteEntry(note, { compact: true }))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Flat note list, newest-edited first */}
          {filtered.length === 0 && (
            <div className="px-2 caption-regular text-neutral-500">{searching ? "No notes found" : "No notes yet"}</div>
          )}
          <div className={SIDEBAR_LIST}>{filtered.map((note) => noteEntry(note))}</div>
        </div>
      </div>
    </aside>
  );
};

export default NoteList;
