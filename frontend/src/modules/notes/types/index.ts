/** Center-pane display mode: Markdown source, split source⟷preview, or preview only. */
export type NoteViewMode = "source" | "split" | "preview";

/** One heading in the active note, for the context panel's outline. */
export interface OutlineItem {
  depth: number;
  text: string;
}
