/** Center-pane display mode: Markdown source, split source⟷preview, or preview only. */
export type NoteViewMode = "source" | "split" | "preview";

/** One heading in the active note, for the context panel's outline. */
export interface OutlineItem {
  depth: number;
  text: string;
}

/** Which tab the right rail is showing, or null when it is closed. */
export type NoteRightPanel = "context" | "ai" | null;

/** How much of the note each chat turn carries. `auto` = the selection if there is one, else all of it. */
export type NoteChatContextMode = "auto" | "whole-note" | "none";

/** One turn in the note chat panel. Lives in component state — nothing is reloaded from the server. */
export interface NoteChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Where a chat reply goes when applied to the note. */
export type NoteApplyMode = "cursor" | "selection" | "append";
