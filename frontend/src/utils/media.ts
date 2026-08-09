/** What a file can be shown as, decided from its MIME type. */
export type MediaKind = "image" | "video" | "audio" | "other";

/**
 * Classifies a stored file for display.
 *
 * The three previewable kinds each have a viewer; everything else — PDFs, archives, source files —
 * is `"other"` and can only be downloaded. One helper rather than the `mimeType.startsWith(...)`
 * chains that had accumulated in the storage browser, the message list and the composer, so all
 * three agree on what an audio file is.
 */
export const mediaKind = (mimeType: string): MediaKind => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "other";
};

/** Whether the file opens in the media viewer at all. */
export const isPreviewable = (mimeType: string) => mediaKind(mimeType) !== "other";
