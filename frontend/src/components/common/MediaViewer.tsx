import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, XIcon } from "lucide-react";
import AudioPlayer from "@/components/common/AudioPlayer";
import { mediaKind } from "@/utils/media";

interface MediaViewerProps {
  /** The file to show. Null closes the viewer — the caller keeps the selection, not an open flag. */
  file: { url: string; originalFilename: string; mimeType: string } | null;
  onClose: () => void;
}

/**
 * Full-screen viewer for a stored image, video or audio file.
 *
 * Portalled to `<body>` rather than rendered in place, like `DiagramViewport`: the storage browser
 * sits inside a scrolling settings column, and an overlay drawn inside it would be clipped by that
 * column's bounds.
 *
 * Documents never reach here — there is nothing this could render for a PDF or an archive that the
 * browser's own download doesn't do better, so those cards keep Download as their only action.
 */
const MediaViewer = ({ file, onClose }: MediaViewerProps) => {
  useEffect(() => {
    if (file === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file, onClose]);

  if (file === null) return null;
  const kind = mediaKind(file.mimeType);
  if (kind === "other") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Click-to-close backdrop — the same shape the search modal uses. */}
      <div onClick={onClose} className="absolute inset-0 bg-black/80" />

      <div className="relative flex h-11.5 shrink-0 items-center gap-x-3 px-4">
        <span className="truncate para-small-medium text-white" title={file.originalFilename}>
          {file.originalFilename}
        </span>
        <a
          href={file.url}
          download={file.originalFilename}
          target="_blank"
          rel="noreferrer"
          aria-label="Download"
          title="Download"
          className="ml-auto shrink-0 cursor-pointer rounded-lg p-2 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <DownloadIcon className="size-4.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="shrink-0 cursor-pointer rounded-lg p-2 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <XIcon className="size-4.5" />
        </button>
      </div>

      {/* The media itself sits above the backdrop and swallows its own clicks, so only the
          surrounding space closes the viewer. */}
      <div onClick={onClose} className="relative flex min-h-0 flex-1 items-center justify-center p-6">
        {kind === "image" && (
          <img
            src={file.url}
            alt={file.originalFilename}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}
        {kind === "video" && (
          <video
            src={file.url}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg"
          />
        )}
        {kind === "audio" && (
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
            <AudioPlayer src={file.url} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default MediaViewer;
