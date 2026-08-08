import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "@/components/common/toast";
import { chatsStream } from "@/services/operations/chats/chats.stream";
import { audioApi } from "@/services/operations/audio/audio.api";
import { mediaApi, type MediaAttachment } from "@/services/operations/media/media.api";
import type { ConversationDetail } from "@/services/operations/chats/chats.route";
import { markDraftCreated } from "@/services/client/loadRoute";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { upsertConversation } from "@/redux/slices/chatListSlice";
import VoiceBar, { type VoiceMode } from "@/modules/chat/components/VoiceBar";
import ChatTopBar from "@/modules/chat/components/ChatMessages/ChatTopBar";
import MessageList from "@/modules/chat/components/ChatMessages/MessageList";
import InputBar from "@/modules/chat/components/ChatMessages/InputBar";
import { blobToWav } from "@/modules/chat/wav";
import { NEW_ITEM_ID, ROUTES } from "@/constants/routes";
import type { ModelProvider } from "@/services/operations/models/models.route";
import {
  DEFAULT_INFERENCE_PARAMS,
  type InferenceParams,
  type SelectedModel,
  type UiMessage,
} from "@/modules/chat/types";
import {
  AUTOSCROLL_THRESHOLD_PX,
  MAX_IMAGES,
  MAX_TEXTAREA_HEIGHT_PX,
  STREAM_MIN_CHARS_PER_FRAME,
  STREAM_REVEAL_DIVISOR,
} from "@/modules/chat/constants";

interface ChatMessagesProps {
  /** The conversation for the current route, loaded by the route loader; null on `/chat`. */
  conversation: ConversationDetail | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const ChatMessages = ({ conversation, sidebarOpen, onToggleSidebar }: ChatMessagesProps) => {
  const chatId = useParams().chatId;
  // A new chat until its first turn creates the conversation; `chatId` then becomes the real id
  // *without* remounting the screen — and so without killing the stream (same route, NEW_ITEM_ID).
  const isDraft = chatId === NEW_ITEM_ID;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { models, loaded: modelsLoaded } = useAppSelector((state) => state.models);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selected, setSelected] = useState<SelectedModel | null>(null);

  // per-request inference settings (not persisted; reset on reload)
  const [params, setParams] = useState<InferenceParams>(DEFAULT_INFERENCE_PARAMS);
  const [verbose, setVerbose] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  // context-window usage (tokens) after the latest turn; powers the context meter
  const [usedTokens, setUsedTokens] = useState<number | null>(null);
  // persona for a new conversation — sent only on the first turn, then baked into history
  const [systemPrompt, setSystemPrompt] = useState("");

  // pending attachments uploaded for the next message
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const inputDisabled =
    modelsLoaded &&
    (models.length === 0 ||
      (!isDraft &&
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

  // Abort the in-flight generation and settle the UI. Safe to call unconditionally:
  // .abort() on a null/already-settled controller is a no-op. Backing out of a chat
  // (switch, unmount, tab close) closes the SSE connection, which the backend detects
  // and uses to stop generation and release the single-model busy lock.
  const abortActiveStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    finalizeRef.current?.();
    setStreaming(false);
  }, []);

  // Seed (or reset) the conversation from the route loader's data when the route changes.
  useEffect(() => {
    autoScrollRef.current = true;

    if (isDraft) {
      abortActiveStream();
      setMessages([]);
      setSelected(null);
      setAttachments([]);
      setSystemPrompt("");
      setUsedTokens(null);
      convIdRef.current = null;
      loadedRef.current = null;
      isNewChatRef.current = true;
      setStreaming(false);
      return;
    }

    const detail = conversation;
    if (!detail) return;

    // already loaded (or currently streaming this one) — don't clobber live messages.
    // This guard also short-circuits the new-chat self-navigation (/chat/new → /chat/:id): the
    // loader refetches, but the stream already claimed this id, so its data is discarded here
    // and the abort below only fires on a real switch to a different conversation.
    if (loadedRef.current === detail.id) return;

    // Switching to a different chat while one is streaming: cancel the old generation
    // (per the abort-and-discard behavior) before showing the new conversation.
    abortActiveStream();

    isNewChatRef.current = false;
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
    setUsedTokens(detail.lastContextTokens);
    setSelected({
      provider: detail.provider as ModelProvider,
      model: detail.model,
      inputModalities: findModalities(detail.provider as ModelProvider, detail.model),
      maxContextTokens: findMaxContextTokens(detail.provider as ModelProvider, detail.model),
      supportsThinking: findSupportsThinking(detail.provider as ModelProvider, detail.model),
    });
    convIdRef.current = detail.id;
    loadedRef.current = detail.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, conversation]);

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

  // stop any in-flight playback, the reveal loop, and the generation when the component
  // unmounts (e.g. leaving chat for Home/Settings)
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // abort the generation on tab/window close. pagehide (not beforeunload — no confirm
  // prompt; not visibilitychange — that also fires on plain tab-switching).
  useEffect(() => {
    const onHide = () => abortRef.current?.abort();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < AUTOSCROLL_THRESHOLD_PX;
  };

  // Synthesize the assistant reply and play it back (used in voice mode).
  const playReply = useCallback(async (text: string) => {
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
  }, []);

  const handleAttachClick = useCallback(() => fileInputRef.current?.click(), []);

  const handleFilesSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: number) => setAttachments((prev) => prev.filter((a) => a.id !== id)), []);

  const handleSend = useCallback(
    (text?: string, opts?: { speak?: boolean; attachments?: MediaAttachment[] }) => {
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
            // The turn bumped the conversation's `updated_at` server-side, so the sidebar row moves
            // to the top — for a new chat this is also what puts it there in the first place.
            dispatch(
              upsertConversation({
                id: conversationId,
                title,
                model: selected.model,
                provider: selected.provider,
                updatedAt: new Date().toISOString(),
              }),
            );
            if (isNewChatRef.current) {
              isNewChatRef.current = false;
              // Relabel `/chat/new` as the conversation the turn just created. Same route, so the
              // screen isn't remounted (which would abort this very stream), and the marker keeps
              // the detail loader from refetching a conversation we're already showing.
              markDraftCreated("chatId", conversationId);
              navigate(ROUTES.CHAT_DETAIL(conversationId), { replace: true });
            }
          },
          onTitle: ({ conversationId, title }) => {
            // A voice-started chat had no typed text to title itself — the backend derived one from
            // the transcript (and bumped the row doing so).
            dispatch(upsertConversation({ id: conversationId, title, updatedAt: new Date().toISOString() }));
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
          onDone: ({ contextTokens }) => {
            // Update the context meter with this turn's usage (null when the provider gave no counts).
            if (contextTokens != null) setUsedTokens(contextTokens);
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
          onBusy: (message) => {
            settle(false); // stop the reveal loop and clear `streaming`; nothing was streamed
            // The server rejected the turn before persisting anything (a different model is
            // generating), so drop the optimistic user + empty-assistant pair and surface a toast
            // only — this must not land in the conversation history.
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              const user = next[next.length - 2];
              if (last?.role === "assistant" && last.content === "" && user?.role === "user") {
                next.splice(next.length - 2, 2);
              }
              return next;
            });
            // Restore the typed text so a transient rejection doesn't lose the user's message.
            if (!opts?.attachments && content) setInput(content);
            toast.error(message);
          },
        },
      );

      abortRef.current = controller;
    },
    [
      input,
      attachments,
      streaming,
      selected,
      systemPrompt,
      params,
      verbose,
      thinkingEnabled,
      dispatch,
      navigate,
      playReply,
    ],
  );

  // Real stop: aborts the fetch, backend catches disconnect and stops generation.
  // Reveals whatever was received and halts the reveal loop (also clears `streaming`).
  const handleStop = useCallback(() => {
    abortActiveStream();
  }, [abortActiveStream]);

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

  const enterVoiceMode = useCallback(() => {
    if (!selected) {
      toast.error("Select a model first");
      return;
    }
    setVoiceMode("recording");
  }, [selected]);

  // Cancel/exit voice mode entirely (aborts streaming + playback).
  const exitVoiceMode = () => {
    handleStop();
    handleStopPlayback();
    setVoiceMode("idle");
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Stable no-arg wrapper so the Send button never forwards its click event as `handleSend`'s
  // `text` param (matching the guard the inline `() => handleSend()` handler used to give it).
  const handleSendClick = useCallback(() => handleSend(), [handleSend]);

  const showEmptyState = isDraft && messages.length === 0;

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

  const maxContextTokens = selected ? findMaxContextTokens(selected.provider, selected.model) : null;
  const supportsThinking = selected ? findSupportsThinking(selected.provider, selected.model) : false;

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col bg-grey text-white">
      <ChatTopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        isDraft={isDraft}
        selected={selected}
        onSelectedChange={setSelected}
        usedTokens={usedTokens}
        maxContextTokens={maxContextTokens}
        supportsThinking={supportsThinking}
        inputDisabled={inputDisabled}
        params={params}
        onParamsChange={setParams}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        verbose={verbose}
        onVerboseChange={setVerbose}
        thinkingEnabled={thinkingEnabled}
        onThinkingChange={setThinkingEnabled}
      />

      {/* Empty state or message list */}
      {showEmptyState ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
          <h1 className="relative heading-small-medium text-center">What's up buddy?</h1>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="chat-scroll relative z-10 flex-1 overflow-y-auto px-4 py-6"
        >
          <MessageList messages={messages} streaming={streaming} />
        </div>
      )}

      {/* Input area */}
      <div className="relative z-10 px-4 pb-3 pt-2">
        <div className="mx-auto max-w-5xl">
          {voiceMode === "idle" ? (
            <InputBar
              input={input}
              onInputChange={setInput}
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
              streaming={streaming}
              disabled={inputDisabled}
              attachDisabled={attachDisabled}
              attachTitle={attachTitle}
              fileInputRef={fileInputRef}
              textareaRef={textareaRef}
              onAttachClick={handleAttachClick}
              onFilesSelected={handleFilesSelected}
              onKeyDown={handleKeyDown}
              onSend={handleSendClick}
              onStop={handleStop}
              onEnterVoice={enterVoiceMode}
            />
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
