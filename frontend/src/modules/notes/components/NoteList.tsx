import { memo, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, HashIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router";
import MainNavbar from "@/components/common/MainNavbar";
import SidebarRowMenu from "@/components/common/SidebarRowMenu";
import SidebarSection from "@/components/common/SidebarSection";
import {
  SIDEBAR_ICON_SLOT,
  SIDEBAR_LIST,
  SIDEBAR_ROW_WRAPPER,
  sidebarIndent,
  sidebarNavRow,
  sidebarRow,
  sidebarShell,
  sidebarShellInner,
} from "@/components/common/sidebar";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { useAppDispatch } from "@/redux/store";
import { removeNote } from "@/redux/slices/notesListSlice";
import { notesRoute, type NoteSummary } from "@/services/operations/notes/notes.route";
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
 * Left pane — the note explorer: a new-note button over two collapsible sections, **Tags** (notes
 * grouped per tag, Obsidian-style) then **Notes** (the flat list). That is the same shape as the
 * diagram sidebar's Diagrams/Folders split, and rows share one [disclosure][icon][label] grid, so
 * the two explorers read as one control.
 *
 * Searching is not here — it lives in the global ⌘K modal, which searches notes *and* chats.
 * The whole pane scrolls on its own, independent of the editor and context panel.
 */
const NoteList = memo(function NoteList({ notes, onCreate, creating, isOpen }: NoteListProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const noteId = useParams().noteId;
  const [tagsOpen, setTagsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const { execute: deleteNote } = useApi(notesRoute.deleteNote);

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

  const noteEntry = (note: NoteSummary, options?: { compact?: boolean; depth?: number }) => (
    <SidebarRowMenu
      key={note.id}
      label={note.title}
      actions={[{ label: "Delete", icon: Trash2Icon, destructive: true, onSelect: () => handleDelete(note.id) }]}
    >
      <div style={{ marginLeft: sidebarIndent(options?.depth ?? 0) }} className={SIDEBAR_ROW_WRAPPER}>
        <NavLink
          to={ROUTES.NOTES_DETAIL(note.id)}
          // Re-navigating to the note we're already on reads as a revalidation and refetches the
          // explorer, so swallow that click.
          onClick={(e) => noteId === String(note.id) && e.preventDefault()}
          // Tag chips stack under the title, so the label column is a column — but the two icon
          // columns stay on the row's baseline, which is what keeps notes aligned with tags.
          className={({ isActive }) => sidebarRow(isActive, "items-start")}
        >
          <span className={SIDEBAR_ICON_SLOT} />
          <FileTextIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-y-1">
            <span className="w-full truncate">{note.title}</span>
            {!options?.compact && note.tags.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-neutral-800 px-1.5 py-0.5 caption-small-regular text-neutral-400 group-hover:bg-neutral-700"
                  >
                    #{tag}
                  </span>
                ))}
              </span>
            )}
          </span>
        </NavLink>
      </div>
    </SidebarRowMenu>
  );

  return (
    // Two elements, as in the chat sidebar: the outer one animates its width, the inner one keeps
    // the full width so the content doesn't reflow on its way out — it fades instead.
    <aside className={sidebarShell(isOpen, isOpen && "border-r border-neutral-800")}>
      <div className={sidebarShellInner(isOpen)}>
        <MainNavbar />
        {/* New note — shares the toolbar height for a uniform top band */}
        <div className="flex h-11.5 shrink-0 items-center px-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className={sidebarNavRow(false, "w-full text-white disabled:cursor-not-allowed disabled:opacity-50")}
          >
            <SquarePenIcon className="size-4.5 shrink-0" />
            New note
          </button>
        </div>

        {/* Explorer body — scrolls independently of the editor and context panel */}
        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {/* Tags above Notes, the same order as the diagram sidebar's Diagrams above Folders. */}
          <SidebarSection
            label="Tags"
            count={notesByTag.length}
            open={tagsOpen}
            onToggle={() => setTagsOpen((open) => !open)}
            emptyLabel="No tags yet"
          >
            <div className={SIDEBAR_LIST}>
              {notesByTag.map(([tag, tagNotes]) => (
                <div key={tag}>
                  <button type="button" onClick={() => toggleTag(tag)} className={sidebarRow()}>
                    {expandedTags.has(tag) ? (
                      <ChevronDownIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
                    ) : (
                      <ChevronRightIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-500")} />
                    )}
                    <HashIcon className={cn(SIDEBAR_ICON_SLOT, "text-neutral-400")} />
                    <span className="truncate">{tag}</span>
                    <span className="ml-auto caption-small-regular text-neutral-600">{tagNotes.length}</span>
                  </button>
                  {expandedTags.has(tag) && (
                    <div className={cn("mt-1", SIDEBAR_LIST)}>
                      {tagNotes.map((note) => noteEntry(note, { compact: true, depth: 1 }))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection
            label="Notes"
            count={notes.length}
            open={notesOpen}
            onToggle={() => setNotesOpen((open) => !open)}
            emptyLabel="No notes yet"
          >
            <div className={SIDEBAR_LIST}>{notes.map((note) => noteEntry(note))}</div>
          </SidebarSection>
        </div>
      </div>
    </aside>
  );
});

export default NoteList;
