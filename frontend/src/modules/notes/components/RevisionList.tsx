import { type RefObject, useEffect, useRef, useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "@/components/common/toast";
import { useApi } from "@/hooks/useApi";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { notesRoute, type NoteDetail, type NoteRevision } from "@/services/operations/notes/notes.route";

interface RevisionListProps {
  noteId: number;
  /** Bump to refetch after an AI edit added a snapshot. */
  refreshKey: number;
  onRestored: (detail: NoteDetail) => void;
  onClose: () => void;
  /** Ref to the toolbar toggle button — clicks on it should not count as "outside". */
  excludeRef: RefObject<HTMLButtonElement | null>;
}

/** Dropdown panel listing a note's revision snapshots with per-entry restore. */
const RevisionList = ({ noteId, refreshKey, onRestored, onClose, excludeRef }: RevisionListProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(panelRef, onClose, excludeRef);
  const { execute: fetchRevisions } = useApi(notesRoute.getRevisions);
  const { execute: restoreRevision, loading: restoring } = useApi(notesRoute.restoreRevision);
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetchRevisions(noteId);
      setRevisions(res.error ? [] : res.response.data.revisions);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, refreshKey]);

  const handleRestore = async (revisionId: number) => {
    const res = await restoreRevision(noteId, revisionId);
    if (res.error) {
      toast.error("Failed to restore revision");
      return;
    }
    onRestored(res.response.data);
  };

  return (
    <div ref={panelRef} className="absolute right-4 top-12 z-30 w-72 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl">
      <div className="px-2 pb-1.5 caption-small-medium text-neutral-500">Revisions</div>
      {revisions.length === 0 ? (
        <div className="px-2 pb-1 caption-regular text-neutral-600">No revisions yet — AI edits create them</div>
      ) : (
        <ul className="chat-scroll max-h-64 overflow-y-auto">
          {revisions.map((revision) => (
            <li key={revision.id} className="flex items-center justify-between gap-x-2 rounded-lg px-2 py-1.5 hover:bg-neutral-800">
              <span className="caption-small-regular text-neutral-300">
                {new Date(revision.createdAt).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => handleRestore(revision.id)}
                disabled={restoring}
                title="Restore this snapshot (the current content is snapshotted first)"
                className="flex shrink-0 cursor-pointer items-center gap-x-1 rounded px-1.5 py-0.5 caption-small-medium text-neutral-400 hover:text-white disabled:opacity-50"
              >
                <RotateCcwIcon className="size-3.5" />
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RevisionList;
