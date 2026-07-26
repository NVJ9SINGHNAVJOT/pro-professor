import type { Group } from "@/modules/chat/types";
import { MATH_HINT } from "@/modules/chat/constants";

export const groupOf = (dateStr: string): Group => {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(dateStr))) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 Days";
  if (diffDays <= 30) return "Previous 30 Days";
  return "Older";
};

/** Format seconds as `m:ss`, e.g. 125 → "2:05". */
export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/** Compact token count, e.g. 1234 → "1.2k", 12345 → "12k". */
export const formatTokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

/** Pick the first MediaRecorder MIME type the browser supports (Chrome: webm, Safari: mp4). */
export function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

/**
 * While a reply streams, LaTeX arrives a character at a time, so the tail is often a half-typed
 * expression ("$\text{CO" shows its raw source, then snaps to CO₂ once the closing "$" lands).
 * Withholding just that dangling expression until it closes keeps the stream from flashing raw
 * markup — the way ChatGPT/Gemini read. A lone "$" that looks like currency ("costs $5") is left
 * alone so real text isn't hidden. Call this only mid-stream; the final content renders in full.
 */
export const hideUnclosedMath = (text: string): string => {
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

/**
 * Splits a settings marker's content into one entry per changed param. The server writes it as a
 * readable summary ("Temperature 0.7 → 0.8 · Max tokens …"), one pill per entry.
 */
export const parseSettingsChanges = (content: string): string[] => {
  const trimmed = content.trim();
  if (!trimmed) return [];
  return trimmed.split(" · ");
};
