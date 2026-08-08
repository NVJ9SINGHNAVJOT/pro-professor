import { memo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FileIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Markdown, { MarkdownBody } from "@/components/common/Markdown";
import AudioPlayer from "@/modules/chat/components/AudioPlayer";
import type { MediaAttachment } from "@/services/operations/media/media.api";
import type { ChatMetricsData, UiMessage } from "@/modules/chat/types";
import { hideUnclosedMath, parseSettingsChanges } from "@/modules/chat/utils";

/** Collapsible panel showing a model's streamed reasoning. */
const ThinkingPanel = ({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer flex w-full items-center gap-1.5 px-3 py-2 text-left caption-small-regular text-neutral-400 hover:text-neutral-200"
      >
        {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        Thinking{isStreaming && "…"}
      </button>
      {open && (
        <MarkdownBody className="px-3 pb-2.5 para-small-regular text-neutral-400">
          <Markdown>{isStreaming ? hideUnclosedMath(thinking) : thinking}</Markdown>
        </MarkdownBody>
      )}
    </div>
  );
};

/** Centered divider marking a mid-conversation settings change, with a pill per changed param. */
const SettingsDivider = memo(function SettingsDivider({ content }: { content: string }) {
  const changes = parseSettingsChanges(content);
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="flex w-full items-center gap-3">
        <span className="h-px flex-1 bg-neutral-400" />
        <span className="flex shrink-0 items-center gap-1.5 caption-small-regular text-neutral-400">
          <SlidersHorizontalIcon className="size-3.5" />
          Model settings changed
        </span>
        <span className="h-px flex-1 bg-neutral-400" />
      </div>
      {changes.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {changes.map((change, i) => (
            <span
              key={i}
              className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-0.5 caption-small-regular text-neutral-400"
            >
              {change}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

/** CLI-style token/timing breakdown shown under a reply when verbose was enabled. */
const MetricsLine = ({ metrics }: { metrics: ChatMetricsData }) => {
  const rows: { label: string; value: string }[] = [];
  if (metrics.totalDurationS != null)
    rows.push({ label: "total duration", value: `${metrics.totalDurationS.toFixed(2)}s` });
  if (metrics.loadDurationS != null)
    rows.push({ label: "load duration", value: `${metrics.loadDurationS.toFixed(2)}s` });
  if (metrics.promptTokens != null)
    rows.push({ label: "prompt eval count", value: `${metrics.promptTokens} token(s)` });
  if (metrics.promptEvalDurationS != null)
    rows.push({ label: "prompt eval duration", value: `${metrics.promptEvalDurationS.toFixed(2)}s` });
  if (metrics.promptEvalRate != null)
    rows.push({ label: "prompt eval rate", value: `${metrics.promptEvalRate.toFixed(2)} tokens/s` });
  if (metrics.completionTokens != null)
    rows.push({ label: "eval count", value: `${metrics.completionTokens} token(s)` });
  if (metrics.evalDurationS != null)
    rows.push({ label: "eval duration", value: `${metrics.evalDurationS.toFixed(2)}s` });
  if (metrics.evalRate != null) rows.push({ label: "eval rate", value: `${metrics.evalRate.toFixed(2)} tokens/s` });
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 w-fit rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 font-mono caption-small-regular text-neutral-500">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3">
          <span className="w-40 shrink-0">{row.label}:</span>
          <span className="text-neutral-400">{row.value}</span>
        </div>
      ))}
    </div>
  );
};

const AssistantMessage = memo(function AssistantMessage({
  content,
  thinking,
  metrics,
  isStreaming,
}: {
  content: string;
  thinking?: string;
  metrics?: ChatMetricsData;
  isStreaming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex">
      <div className="flex-1 min-w-0">
        {thinking && <ThinkingPanel thinking={thinking} isStreaming={isStreaming && !content} />}
        <MarkdownBody className="para-regular text-neutral-100">
          <Markdown>{isStreaming ? hideUnclosedMath(content) : content}</Markdown>
          {isStreaming && (
            <span aria-hidden className="ct-wave ml-1 text-neutral-400">
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
        </MarkdownBody>
        {metrics && <MetricsLine metrics={metrics} />}
        {!isStreaming && content && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy message"
            className="mt-4 cursor-pointer rounded-md text-neutral-400 transition-opacity hover:bg-neutral-800 hover:text-white"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
});

/** Renders a failed assistant turn — saved to history so the error is visible on reload. */
const ErrorMessage = memo(function ErrorMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <p className="para-small-medium wrap-break-word">{content}</p>
    </div>
  );
});

/** Renders a message's attachments — images inline, audio as a player, other files as a chip. */
const MessageAttachments = memo(function MessageAttachments({ attachments }: { attachments: MediaAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-2">
      {attachments.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
            <img src={a.url} alt={a.originalFilename} className="max-h-48 max-w-64 rounded-2xl object-cover" />
          </a>
        ) : a.mimeType.startsWith("audio/") ? (
          <AudioPlayer key={a.id} src={a.url} />
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl bg-neutral-700 px-3 py-2 para-small-medium text-neutral-100 hover:bg-neutral-600"
          >
            <FileIcon className="size-4 shrink-0" />
            <span className="max-w-48 truncate">{a.originalFilename}</span>
          </a>
        ),
      )}
    </div>
  );
});

/** A user turn — the right-aligned bubble plus any attachments sent with it. */
const UserMessage = memo(function UserMessage({ message }: { message: UiMessage }) {
  return (
    <div className="flex flex-col items-end">
      {message.attachments && <MessageAttachments attachments={message.attachments} />}
      {message.content && (
        <div className="max-w-[75%] whitespace-pre-wrap wrap-break-word rounded-3xl bg-linear-to-br from-neutral-700 to-neutral-600 px-4 py-2 para-small-medium shadow-sm">
          {message.content}
        </div>
      )}
    </div>
  );
});

interface MessageListProps {
  messages: UiMessage[];
  streaming: boolean;
}

/** The conversation thread. Rendered inside the orchestrator's scroll container. */
const MessageList = ({ messages, streaming }: MessageListProps) => (
  <div className="mx-auto flex max-w-5xl flex-col gap-y-6">
    {messages.map((message, index) => {
      if (message.role === "user") {
        return <UserMessage key={index} message={message} />;
      }
      if (message.role === "settings") {
        return <SettingsDivider key={index} content={message.content} />;
      }
      if (message.role === "error") {
        return <ErrorMessage key={index} content={message.content} />;
      }
      return (
        <AssistantMessage
          key={index}
          content={message.content}
          thinking={message.thinking}
          metrics={message.metrics}
          isStreaming={streaming && index === messages.length - 1}
        />
      );
    })}
  </div>
);

export default MessageList;
