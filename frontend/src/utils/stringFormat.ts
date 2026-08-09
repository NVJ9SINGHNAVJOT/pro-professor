export function trimWhitespaceAndNewlines(value: string): string {
  // Step 1: Trim leading and trailing white spaces and newlines
  const trimmedValue = value.trim().replace(/^\n+|\n+$/g, "");
  // Step 2: Remove trailing white spaces from each line
  const lines = trimmedValue.split("\n").map((line) => line.replace(/\s+$/, ""));
  // Step 3: Join the lines back together
  return lines.join("\n");
}

/** Seconds → `m:ss`, for media transport labels. Non-finite input (a stream still loading) is 0:00. */
export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
