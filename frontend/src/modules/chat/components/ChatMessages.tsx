import { memo, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "@/components/common/toast";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FileIcon,
  MicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { chatsStream } from "@/services/operations/chats/chats.stream";
import { audioApi } from "@/services/operations/audio/audio.api";
import { mediaApi, type MediaAttachment } from "@/services/operations/media/media.api";
import { useApi } from "@/hooks/useApi";
import { chatsRoute } from "@/services/operations/chats/chats.route";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { addConversation, renameConversation } from "@/redux/slices/chatSlice";
import ModelSelector from "@/modules/chat/components/ModelSelector";
import ChatSettings from "@/modules/chat/components/ChatSettings";
import VoiceBar, { type VoiceMode } from "@/modules/chat/components/VoiceBar";
import AudioPlayer from "@/modules/chat/components/AudioPlayer";
import { blobToWav } from "@/modules/chat/wav";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";
import type { ModelProvider } from "@/services/operations/models/models.route";
import {
  DEFAULT_INFERENCE_PARAMS,
  type ChatMetricsData,
  type InferenceParams,
  type SelectedModel,
  type UiMessage,
} from "@/modules/chat/types";
import {
  AUTOSCROLL_THRESHOLD_PX,
  MAX_TEXTAREA_HEIGHT_PX,
  STREAM_MIN_CHARS_PER_FRAME,
  STREAM_REVEAL_DIVISOR,
  SUGGESTIONS,
} from "@/modules/chat/constants";

/** Max images attachable to one turn — base64 inflates the request and small VLMs degrade past a couple. */
const MAX_IMAGES = 2;

/**
 * Markdown + GitHub-flavored + KaTeX, memoized on its source so a token that doesn't change
 * the rendered string (e.g. while an unclosed math token is being withheld) skips re-parsing.
 */
const Markdown = memo(({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
    {children}
  </ReactMarkdown>
));
Markdown.displayName = "Markdown";

/** Characters that mark text inside `$…$` as a LaTeX expression rather than plain prose/currency. */
const MATH_HINT = /[\\{}^_]/;

/**
 * While a reply streams, LaTeX arrives a character at a time, so the tail is often a half-typed
 * expression ("$\text{CO" shows its raw source, then snaps to CO₂ once the closing "$" lands).
 * Withholding just that dangling expression until it closes keeps the stream from flashing raw
 * markup — the way ChatGPT/Gemini read. A lone "$" that looks like currency ("costs $5") is left
 * alone so real text isn't hidden. Call this only mid-stream; the final content renders in full.
 */
const hideUnclosedMath = (text: string): string => {
  // Display math ($$…$$): an odd count of delimiters means the last block is still open.
  if ((text.match(/\$\$/g)?.length ?? 0) % 2 === 1) {
    const cut = text.lastIndexOf("$$");
    if (MATH_HINT.test(text.slice(cut))) return text.slice(0, cut);
  }
  // Inline math ($…$): same idea for single delimiters.
  if ((text.match(/\$/g)?.length ?? 0) % 2 === 1) {
    const cut = text.lastIndexOf("$");
    if (MATH_HINT.test(text.slice(cut))) return text.slice(0, cut);
  }
  return text;
};

/** Collapsible panel showing a model's streamed reasoning. */
const ThinkingPanel = ({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left caption-small-regular text-neutral-400 hover:text-neutral-200"
      >
        {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        Thinking{isStreaming && "…"}
      </button>
      {open && (
        <div className="chat-markdown wrap-break-word px-3 pb-2.5 para-small-regular text-neutral-400">
          <Markdown>{isStreaming ? hideUnclosedMath(thinking) : thinking}</Markdown>
        </div>
      )}
    </div>
  );
};

/** Friendly labels for the inference params, used to render legacy JSON settings markers. */
const SETTINGS_FIELD_LABELS: Record<string, string> = {
  maxTokens: "Max tokens",
  temperature: "Temperature",
  topP: "Top P",
  repetitionPenalty: "Repetition penalty",
};

/**
 * Splits a settings marker's content into one entry per changed param.
 * Current markers store a readable summary ("Temperature 0.7 → 0.8 · Max tokens …");
 * markers saved before that change hold a JSON snapshot of the new params, parsed here so
 * they still render as tidy pills.
 */
const parseSettingsChanges = (content: string): string[] => {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      return Object.entries(obj).map(([k, v]) => `${SETTINGS_FIELD_LABELS[k] ?? k} → ${v}`);
    } catch {
      return [trimmed];
    }
  }
  return trimmed.split(" · ");
};

/** Centered divider marking a mid-conversation settings change, with a pill per changed param. */
const SettingsDivider = ({ content }: { content: string }) => {
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
};

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

const AssistantMessage = ({
  content,
  thinking,
  metrics,
  isStreaming,
}: {
  content: string;
  thinking?: string;
  metrics?: ChatMetricsData;
  isStreaming: boolean;
}) => {
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
        <div className="chat-markdown wrap-break-word para-regular text-neutral-100">
          <Markdown>{isStreaming ? hideUnclosedMath(content) : content}</Markdown>
          {isStreaming && (
            <span aria-hidden className="ct-wave ml-1 text-neutral-400">
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
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
};

/** Renders a failed assistant turn — saved to history so the error is visible on reload. */
const ErrorMessage = ({ content }: { content: string }) => (
  <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
    <p className="para-small-medium wrap-break-word">{content}</p>
  </div>
);

/** Renders a message's attachments — images inline, audio as a player, other files as a chip. */
const MessageAttachments = ({ attachments }: { attachments: MediaAttachment[] }) => {
  if (attachments.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-2">
      {attachments.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <a key={a.id} href={mediaApi.fileUrl(a.id)} target="_blank" rel="noreferrer">
            <img
              src={mediaApi.fileUrl(a.id)}
              alt={a.originalFilename}
              className="max-h-48 max-w-64 rounded-2xl object-cover"
            />
          </a>
        ) : a.mimeType.startsWith("audio/") ? (
          <AudioPlayer key={a.id} src={mediaApi.fileUrl(a.id)} />
        ) : (
          <a
            key={a.id}
            href={mediaApi.fileUrl(a.id)}
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
};

interface ChatMessagesProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const ChatMessages = ({ sidebarOpen, onToggleSidebar }: ChatMessagesProps) => {
  const chatId = useParams().chatId;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { execute: fetchConversation } = useApi(chatsRoute.getConversation);
  const { models, loaded: modelsLoaded } = useAppSelector((state) => state.models);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<SelectedModel | null>(null);

  // per-request inference settings (not persisted; reset on reload)
  const [params, setParams] = useState<InferenceParams>(DEFAULT_INFERENCE_PARAMS);
  const [verbose, setVerbose] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  // persona for a new conversation — sent only on the first turn, then baked into history
  const [systemPrompt, setSystemPrompt] = useState("");

  // pending attachments uploaded for the next message
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const inputDisabled =
    modelsLoaded &&
    (models.length === 0 ||
      (Boolean(chatId) &&
        selected !== null &&
        !models.some((m) => m.provider === selected.provider && m.name === selected.model)));

  // voice chat state
  const [voiceMode, setVoiceMode] = useState<VoiceMode | "idle">("idle");
  const [playbackAudio, setPlaybackAudio] = useState<HTMLAudioElement | null>(null);

  // refs
  const convIdRef = useRef<number | null>(null);
  const loadedRef = useRef<number | null>(null);
  const isNewChatRef = useRef<boolean>(true);
  const selectedRef = useRef<SelectedModel | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // rAF handle for the smooth-reveal loop, and a finalize hook so a stop/unmount can flush the
  // received text and halt the loop from outside the per-request closure.
  const rafRef = useRef<number | null>(null);
  const finalizeRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Input modalities for a model, from the loaded list (falls back to text-only).
  // Read at decision time so it's correct even if the conversation loaded before
  // the models list did (cold reload).
  const findModalities = (provider: ModelProvider, model: string): string[] =>
    models.find((m) => m.provider === provider && m.name === model)?.inputModalities ?? ["text"];

  const findMaxContextTokens = (provider: ModelProvider, model: string): number | null =>
    models.find((m) => m.provider === provider && m.name === model)?.maxContextTokens ?? null;

  // Re-derived at render time (like findModalities): on a cold reload the conversation loads
  // before the models list does, so the flag baked into `selected` can be stale (false). This
  // reads the loaded list, which is correct once it arrives.
  const findSupportsThinking = (provider: ModelProvider, model: string): boolean =>
    models.find((m) => m.provider === provider && m.name === model)?.supportsThinking ?? false;

  // load (or reset) conversation when the route param changes
  useEffect(() => {
    autoScrollRef.current = true;

    if (!chatId) {
      setMessages([]);
      setSelected(null);
      setAttachments([]);
      setSystemPrompt("");
      convIdRef.current = null;
      loadedRef.current = null;
      isNewChatRef.current = true;
      setStreaming(false);
      return;
    }

    const id = Number(chatId);
    // already loaded (or currently streaming this one) — don't clobber live messages
    if (loadedRef.current === id) return;

    isNewChatRef.current = false;
    (async () => {
      const res = await fetchConversation(id);
      if (res.error) {
        toast.error("Failed to load conversation");
        return;
      }
      const detail = res.response.data;
      setMessages(
        // The persona is stored as a system row; it's an instruction, not a chat bubble.
        detail.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            // "system" rows are filtered out above, so the role is never "system".
            role: m.role as UiMessage["role"],
            content: m.content,
            attachments: m.attachments,
          })),
      );
      // Restore the conversation's persisted inference settings + display toggles.
      setParams({
        maxTokens: detail.maxTokens,
        temperature: detail.temperature,
        topP: detail.topP,
        repetitionPenalty: detail.repetitionPenalty,
      });
      setVerbose(detail.verbose);
      setThinkingEnabled(detail.thinkingEnabled);
      setSelected({
        provider: detail.provider as ModelProvider,
        model: detail.model,
        inputModalities: findModalities(detail.provider as ModelProvider, detail.model),
        maxContextTokens: findMaxContextTokens(detail.provider as ModelProvider, detail.model),
        supportsThinking: findSupportsThinking(detail.provider as ModelProvider, detail.model),
      });
      convIdRef.current = id;
      loadedRef.current = id;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // auto-scroll on new content unless the user scrolled away from the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // auto-grow the textarea with its content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [input]);

  // stop any in-flight playback and the reveal loop when the component unmounts
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < AUTOSCROLL_THRESHOLD_PX;
  };

  // Synthesize the assistant reply and play it back (used in voice mode).
  const playReply = async (text: string) => {
    try {
      const blob = await audioApi.synthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        setPlaybackAudio(null);
        setVoiceMode("idle");
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      setPlaybackAudio(audio);
      setVoiceMode("speaking");
      await audio.play();
    } catch {
      setPlaybackAudio(null);
      setVoiceMode("idle");
      toast.error("Couldn't play the spoken reply");
    }
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;

    const remaining = MAX_IMAGES - attachments.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_IMAGES} images`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`You can attach up to ${MAX_IMAGES} images`);
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(toUpload.map((file) => mediaApi.upload(file)));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id: number) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleSend = (text?: string, opts?: { speak?: boolean; attachments?: MediaAttachment[] }) => {
    const content = (text ?? input).trim();
    // The voice/audio path passes its uploaded clip explicitly; otherwise use the
    // attachments pending in the input bar.
    const pending = opts?.attachments ?? attachments;
    if ((!content && pending.length === 0) || streaming) return;
    if (!selected) {
      toast.error("Select a model first");
      return;
    }

    autoScrollRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "user", content, attachments: pending },
      { role: "assistant", content: "" },
    ]);
    // Only clear the input bar's own state when we actually consumed it.
    if (!opts?.attachments) {
      setInput("");
      setAttachments([]);
    }
    setStreaming(true);

    // --- smooth reveal --------------------------------------------------------------------------
    // Received text is the *target*; a character cursor walks toward it on a requestAnimationFrame
    // loop, so the on-screen reveal stays steady even when the network delivers tokens in bursts.
    let fullReply = "";
    let fullThinking = "";
    let shownReply = 0;
    let shownThinking = 0;
    let streamDone = false;
    let settled = false;

    // Paint the currently revealed prefixes into the streaming assistant message.
    const paint = () => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            content: fullReply.slice(0, shownReply),
            ...(fullThinking ? { thinking: fullThinking.slice(0, shownThinking) } : {}),
          };
        }
        return next;
      });
    };

    // Reveal a slice of the backlog: larger when far behind, easing to the floor as it catches up.
    const advance = (shown: number, total: number): number =>
      shown >= total
        ? shown
        : Math.min(
            total,
            shown + Math.max(STREAM_MIN_CHARS_PER_FRAME, Math.ceil((total - shown) / STREAM_REVEAL_DIVISOR)),
          );

    // Finish once: reveal everything received, stop the loop, run completion side effects.
    const settle = (speak: boolean) => {
      if (settled) return;
      settled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      shownReply = fullReply.length;
      shownThinking = fullThinking.length;
      paint();
      setStreaming(false);
      finalizeRef.current = null;
      if (speak && opts?.speak && fullReply.trim()) void playReply(fullReply);
      else if (opts?.speak) setVoiceMode("idle");
    };

    const tick = () => {
      const nextReply = advance(shownReply, fullReply.length);
      const nextThinking = advance(shownThinking, fullThinking.length);
      if (nextReply !== shownReply || nextThinking !== shownThinking) {
        shownReply = nextReply;
        shownThinking = nextThinking;
        paint();
      }
      // Caught up: idle the loop (onChunk restarts it) — or settle if the stream has also ended.
      if (shownReply >= fullReply.length && shownThinking >= fullThinking.length) {
        rafRef.current = null;
        if (streamDone) settle(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    // Restart the loop after new tokens land (no-op while it's already running or after settle).
    const pump = () => {
      if (rafRef.current === null && !settled) rafRef.current = requestAnimationFrame(tick);
    };

    // A stop/unmount reveals what's been received and halts the loop without speaking the reply.
    finalizeRef.current = () => settle(false);

    const controller = chatsStream.send(
      {
        conversationId: convIdRef.current,
        provider: selected.provider,
        model: selected.model,
        content,
        attachmentIds: pending.map((a) => a.id),
        // Only a new conversation can take a persona; ignored once one exists.
        systemPrompt: convIdRef.current === null ? systemPrompt.trim() || undefined : undefined,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        topP: params.topP,
        repetitionPenalty: params.repetitionPenalty,
        verbose,
        thinkingEnabled,
      },
      {
        onStart: ({ conversationId, title }) => {
          convIdRef.current = conversationId;
          loadedRef.current = conversationId;
          if (isNewChatRef.current) {
            isNewChatRef.current = false;
            dispatch(
              addConversation({
                id: conversationId,
                title,
                model: selectedRef.current?.model ?? "",
                updatedAt: new Date().toISOString(),
              }),
            );
            navigate(ROUTES.CHAT_DETAIL(conversationId), { replace: true });
          }
        },
        onTitle: ({ conversationId, title }) => {
          // A voice-started chat had no typed text to title itself — fill the sidebar entry
          // (added empty in onStart) once the backend derives a title from the transcript.
          dispatch(renameConversation({ id: conversationId, title }));
        },
        onTranscript: ({ content }) => {
          // Audio turn: the model transcribed its own input. Fill the user bubble (sent with
          // empty text) — it sits just before the streaming assistant placeholder.
          setMessages((prev) => {
            const next = [...prev];
            const userIdx = next.length - 2;
            const userMsg = next[userIdx];
            if (userMsg && userMsg.role === "user") {
              next[userIdx] = { ...userMsg, content };
            }
            return next;
          });
        },
        onSettings: ({ summary }) => {
          // Drop the divider above this turn's user/assistant pair (the last two entries),
          // matching where it lands on reload. The summary lists which params changed.
          setMessages((prev) => {
            const next = [...prev];
            next.splice(next.length - 2, 0, { role: "settings", content: summary });
            return next;
          });
        },
        onChunk: ({ delta }) => {
          fullReply += delta;
          pump();
        },
        onThinking: ({ delta }) => {
          // The toggle is opt-in: drop reasoning when the user hasn't asked to see it.
          if (!thinkingEnabled) return;
          fullThinking += delta;
          pump();
        },
        onMetrics: (data) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, metrics: data };
            }
            return next;
          });
        },
        onDone: () => {
          // Let the reveal drain the remaining backlog; the loop settles (and speaks) when caught up.
          streamDone = true;
          pump();
        },
        onError: (message, meta) => {
          settle(false); // reveal any partial reply and stop the loop before showing the error
          const display = meta?.requestId ? `${message} (ref: ${meta.requestId})` : message;
          // Replace the empty assistant placeholder with the error; keep any partial reply above it.
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.content === "") {
              next[next.length - 1] = { role: "error", content: display };
            } else {
              next.push({ role: "error", content: display });
            }
            return next;
          });
          toast.error(message);
        },
      },
    );

    abortRef.current = controller;
  };

  // Real stop: aborts the fetch, backend catches disconnect and stops generation
  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Reveal whatever was received and halt the reveal loop (also clears `streaming`).
    finalizeRef.current?.();
    setStreaming(false);
  };

  const handleStopPlayback = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audioRef.current = null;
    }
    setPlaybackAudio(null);
    setVoiceMode("idle");
  };

  // Voice utterance. Audio-capable models receive the clip directly (uploaded as
  // WAV, sent with empty text); text models are transcribed to text first. Either
  // way the reply is spoken back.
  const handleUtterance = async (blob: Blob) => {
    if (!selected) {
      toast.error("Select a model first");
      setVoiceMode("idle");
      return;
    }
    try {
      setVoiceMode("thinking");
      const acceptsAudio = findModalities(selected.provider, selected.model).includes("audio");
      if (acceptsAudio) {
        const wav = await blobToWav(blob);
        const file = new File([wav], "utterance.wav", { type: "audio/wav" });
        const media = await mediaApi.upload(file);
        handleSend("", { speak: true, attachments: [media] });
        return;
      }
      const text = await audioApi.transcribe(blob);
      if (!text.trim()) {
        toast.error("Didn't catch that — please try again");
        setVoiceMode("idle");
        return;
      }
      handleSend(text, { speak: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't process the recording");
      setVoiceMode("idle");
    }
  };

  const enterVoiceMode = () => {
    if (!selected) {
      toast.error("Select a model first");
      return;
    }
    setVoiceMode("recording");
  };

  // Cancel/exit voice mode entirely (aborts streaming + playback).
  const exitVoiceMode = () => {
    handleStop();
    handleStopPlayback();
    setVoiceMode("idle");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showEmptyState = !chatId && messages.length === 0;

  // Paperclip is image-only: enable it only for image-capable models, and cap at MAX_IMAGES.
  // findModalities re-derives from the loaded list, so this is correct even on a cold reload.
  const acceptsImages = Boolean(selected && findModalities(selected.provider, selected.model).includes("image"));
  const attachLimitReached = attachments.length >= MAX_IMAGES;
  const attachDisabled = inputDisabled || uploading || !acceptsImages || attachLimitReached;
  const attachTitle = !acceptsImages
    ? "This model doesn't accept images"
    : attachLimitReached
      ? `You can attach up to ${MAX_IMAGES} images`
      : "Attach image";

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col bg-grey text-white">
      {/* Background glow (only for empty state, covers full section) */}
      {showEmptyState && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="ct-float absolute left-1/2 top-1/3 size-150 rounded-full bg-linear-to-br from-richblue-300/15 to-neutral-700/20 blur-3xl" />
        </div>
      )}

      {/* Top bar: sidebar toggle + model selector — height matches the sidebar header */}
      <div className="relative z-20 flex h-11.5 shrink-0 items-center gap-2 pt-2 px-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
        >
          {sidebarOpen ? <PanelLeftCloseIcon className="size-5" /> : <PanelLeftOpenIcon className="size-5" />}
        </button>
        <ModelSelector value={selected} onChange={setSelected} disabled={Boolean(chatId)} />
        <div className="ml-auto">
          <ChatSettings
            params={params}
            onParamsChange={setParams}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            canEditSystemPrompt={!chatId}
            verbose={verbose}
            onVerboseChange={setVerbose}
            thinkingEnabled={thinkingEnabled}
            onThinkingChange={setThinkingEnabled}
            supportsThinking={selected ? findSupportsThinking(selected.provider, selected.model) : false}
            maxContextTokens={selected ? findMaxContextTokens(selected.provider, selected.model) : null}
            modelSelected={selected !== null}
            disabled={inputDisabled}
          />
        </div>
      </div>

      {/* Empty state or message list */}
      {showEmptyState ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
          <h1 className="relative heading-small-medium text-center">What can I help with?</h1>
          <div className="relative mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.title}
                type="button"
                onClick={() => handleSend(suggestion.prompt)}
                className="cursor-pointer rounded-2xl border border-neutral-800 bg-neutral-800/40 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-600 hover:bg-neutral-800"
              >
                <div className="para-small-semibold text-neutral-200">{suggestion.title}</div>
                <div className="truncate caption-small-regular text-neutral-500">{suggestion.prompt}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="chat-scroll relative z-10 flex-1 overflow-y-auto px-4 py-6"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-y-6">
            {messages.map((message, index) => {
              if (message.role === "user") {
                return (
                  <div key={index} className="flex flex-col items-end">
                    {message.attachments && <MessageAttachments attachments={message.attachments} />}
                    {message.content && (
                      <div className="max-w-[75%] whitespace-pre-wrap wrap-break-word rounded-3xl bg-linear-to-br from-neutral-700 to-neutral-600 px-4 py-2 para-small-medium shadow-sm">
                        {message.content}
                      </div>
                    )}
                  </div>
                );
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
        </div>
      )}

      {/* Input area */}
      <div className="relative z-10 px-4 pb-3 pt-2">
        <div className="mx-auto max-w-5xl">
          {voiceMode === "idle" ? (
            <div className="rounded-3xl bg-chat-input px-3 py-2 shadow-lg">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      className="group relative flex items-center gap-2 rounded-xl bg-neutral-700 py-1.5 pl-2 pr-1.5 caption-small-regular text-neutral-200"
                    >
                      {a.mimeType.startsWith("image/") ? (
                        <img
                          src={mediaApi.fileUrl(a.id)}
                          alt={a.originalFilename}
                          className="size-9 rounded-lg object-cover"
                        />
                      ) : (
                        <FileIcon className="size-4 shrink-0" />
                      )}
                      <span className="max-w-32 truncate">{a.originalFilename}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
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
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleAttachClick}
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
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={inputDisabled}
                  placeholder={inputDisabled ? "Model not available" : "Message..."}
                  className={cn(
                    "flex-1 resize-none bg-transparent px-1 py-2 outline-none para-small-medium",
                    inputDisabled ? "cursor-not-allowed placeholder:text-neutral-600" : "placeholder:text-neutral-500",
                  )}
                />
                {streaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    aria-label="Stop generating"
                    className="cursor-pointer rounded-full bg-white p-2.5 text-black transition-transform hover:scale-105"
                  >
                    <SquareIcon className="size-4 fill-current" />
                  </button>
                ) : input.trim() || attachments.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    aria-label="Send message"
                    className="cursor-pointer rounded-full bg-linear-to-br from-white to-neutral-400 p-2.5 text-black transition-all hover:scale-105"
                  >
                    <ArrowUpIcon className="size-4.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={enterVoiceMode}
                    disabled={inputDisabled}
                    aria-label="Start voice chat"
                    className={cn(
                      "rounded-full p-2.5 transition-all",
                      inputDisabled
                        ? "cursor-not-allowed text-neutral-600"
                        : "cursor-pointer text-neutral-300 hover:bg-neutral-700 hover:text-white",
                    )}
                  >
                    <MicIcon className="size-4.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <VoiceBar
              mode={voiceMode}
              playbackAudio={playbackAudio}
              onRecorded={handleUtterance}
              onStopSpeaking={handleStopPlayback}
              onCancel={exitVoiceMode}
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default ChatMessages;
