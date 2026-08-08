import { memo } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import ModelSelector from "@/components/common/ModelSelector";
import ChatSettings from "@/modules/chat/components/ChatSettings";
import { cn } from "@/lib/utils";
import type { InferenceParams, SelectedModel } from "@/modules/chat/types";
import { formatTokens } from "@/modules/chat/utils";

/** Context-window usage meter: how much of the model's context the conversation currently occupies. */
const ContextMeter = ({ used, max }: { used: number | null; max: number | null }) => {
  if (used == null || used === 0) return null;
  // No known window for this model — show the raw count only.
  if (max == null) {
    return (
      <span className="caption-small-regular text-neutral-500" title={`${used.toLocaleString()} tokens used`}>
        {formatTokens(used)} tokens
      </span>
    );
  }
  const pct = Math.min(100, (used / max) * 100);
  const remaining = Math.max(0, max - used);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div
      className="flex items-center gap-2 caption-small-regular text-neutral-400"
      title={`${used.toLocaleString()} / ${max.toLocaleString()} tokens · ${remaining.toLocaleString()} left`}
    >
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-700">
        <span className={cn("block h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </span>
      <span>
        {formatTokens(used)} / {formatTokens(max)}
      </span>
    </div>
  );
};

interface ChatTopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isDraft: boolean;
  selected: SelectedModel | null;
  onSelectedChange: (value: SelectedModel) => void;
  usedTokens: number | null;
  maxContextTokens: number | null;
  supportsThinking: boolean;
  inputDisabled: boolean;
  params: InferenceParams;
  onParamsChange: (params: InferenceParams) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  verbose: boolean;
  onVerboseChange: (value: boolean) => void;
  thinkingEnabled: boolean;
  onThinkingChange: (value: boolean) => void;
}

/** Sidebar toggle + model picker + context meter + inference settings — the chat screen's header. */
const ChatTopBar = memo(function ChatTopBar({
  sidebarOpen,
  onToggleSidebar,
  isDraft,
  selected,
  onSelectedChange,
  usedTokens,
  maxContextTokens,
  supportsThinking,
  inputDisabled,
  params,
  onParamsChange,
  systemPrompt,
  onSystemPromptChange,
  verbose,
  onVerboseChange,
  thinkingEnabled,
  onThinkingChange,
}: ChatTopBarProps) {
  return (
    <div className="relative z-20 flex h-11.5 shrink-0 items-center gap-2 pt-2 px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="cursor-pointer rounded-lg p-2 text-neutral-300 hover:bg-neutral-800"
      >
        {sidebarOpen ? <PanelLeftCloseIcon className="size-5" /> : <PanelLeftOpenIcon className="size-5" />}
      </button>
      <ModelSelector value={selected} onChange={onSelectedChange} disabled={!isDraft} />
      <div className="ml-auto flex items-center gap-3">
        <ContextMeter used={usedTokens} max={maxContextTokens} />
        <ChatSettings
          params={params}
          onParamsChange={onParamsChange}
          systemPrompt={systemPrompt}
          onSystemPromptChange={onSystemPromptChange}
          canEditSystemPrompt={isDraft}
          verbose={verbose}
          onVerboseChange={onVerboseChange}
          thinkingEnabled={thinkingEnabled}
          onThinkingChange={onThinkingChange}
          supportsThinking={supportsThinking}
          maxContextTokens={maxContextTokens}
          modelSelected={selected !== null}
          disabled={inputDisabled}
        />
      </div>
    </div>
  );
});

export default ChatTopBar;
