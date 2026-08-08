import { memo, type RefObject } from "react";
import { ArrowUpIcon, FileIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react";
import type { MediaAttachment } from "@/services/operations/media/media.api";
import { cn } from "@/lib/utils";

/** Voice-mode glyph: a symmetric audio waveform, shown on the button that enters voice chat. */
const WaveformIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <line x1="4" y1="10" x2="4" y2="14" />
    <line x1="8.5" y1="7" x2="8.5" y2="17" />
    <line x1="12" y1="3.5" x2="12" y2="20.5" />
    <line x1="15.5" y1="7" x2="15.5" y2="17" />
    <line x1="20" y1="10" x2="20" y2="14" />
  </svg>
);

interface InputBarProps {
  input: string;
  onInputChange: (value: string) => void;
  attachments: MediaAttachment[];
  onRemoveAttachment: (id: number) => void;
  streaming: boolean;
  disabled: boolean;
  attachDisabled: boolean;
  attachTitle: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onAttachClick: () => void;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  onEnterVoice: () => void;
}

/** The composer: attachment previews, textarea, and the attach/send/stop/voice-entry controls. */
const InputBar = memo(function InputBar({
  input,
  onInputChange,
  attachments,
  onRemoveAttachment,
  streaming,
  disabled,
  attachDisabled,
  attachTitle,
  fileInputRef,
  textareaRef,
  onAttachClick,
  onFilesSelected,
  onKeyDown,
  onSend,
  onStop,
  onEnterVoice,
}: InputBarProps) {
  return (
    <div className="rounded-3xl bg-chat-input px-3 py-2 shadow-lg">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-2 rounded-xl bg-neutral-700 py-1.5 pl-2 pr-1.5 caption-small-regular text-neutral-200"
            >
              {a.mimeType.startsWith("image/") ? (
                <img src={a.url} alt={a.originalFilename} className="size-9 rounded-lg object-cover" />
              ) : (
                <FileIcon className="size-4 shrink-0" />
              )}
              <span className="max-w-32 truncate">{a.originalFilename}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Remove ${a.originalFilename}`}
                className="cursor-pointer rounded-full p-0.5 text-neutral-400 hover:bg-neutral-600 hover:text-white"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-x-1.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          aria-label="Upload file"
          tabIndex={-1}
          onChange={onFilesSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={onAttachClick}
          disabled={attachDisabled}
          aria-label="Attach image"
          title={attachTitle}
          className={cn(
            "rounded-full p-2.5 transition-colors",
            attachDisabled
              ? "cursor-not-allowed text-neutral-600"
              : "cursor-pointer text-neutral-300 hover:bg-neutral-700 hover:text-white",
          )}
        >
          <PaperclipIcon className="size-4.5" />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? "Model not available" : "Message..."}
          className={cn(
            "flex-1 resize-none bg-transparent px-1 py-2 outline-none para-small-medium",
            disabled ? "cursor-not-allowed placeholder:text-neutral-600" : "placeholder:text-neutral-500",
          )}
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="cursor-pointer rounded-full bg-white p-2.5 text-black transition-transform hover:scale-105"
          >
            <SquareIcon className="size-4 fill-current" />
          </button>
        ) : input.trim() || attachments.length > 0 ? (
          <button
            type="button"
            onClick={onSend}
            aria-label="Send message"
            className="cursor-pointer rounded-full bg-linear-to-br from-white to-neutral-400 p-2.5 text-black transition-all hover:scale-105"
          >
            <ArrowUpIcon className="size-4.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnterVoice}
            disabled={disabled}
            aria-label="Start voice chat"
            className={cn(
              "rounded-full bg-black p-2.5 text-white transition-all",
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-105",
            )}
          >
            <WaveformIcon className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
});

export default InputBar;
