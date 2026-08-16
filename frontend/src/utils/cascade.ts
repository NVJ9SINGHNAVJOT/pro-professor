const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * What deleting a folder takes with it, for the confirm dialog.
 *
 * Deleting a folder cascades server-side through subfolders and everything inside them, and nothing
 * undoes it — so the dialog has to name the cost rather than ask "are you sure?". Global because
 * both explorers ask the same question and modules may not import from one another.
 *
 * @param itemNoun singular — "note", "diagram".
 */
export const cascadeMessage = (itemCount: number, itemNoun: string, subfolderCount: number): string => {
  const parts: string[] = [];
  if (itemCount > 0) parts.push(plural(itemCount, itemNoun));
  if (subfolderCount > 0) parts.push(plural(subfolderCount, "subfolder"));
  const undone = "This can't be undone.";
  // An empty folder costs nothing but itself, and listing "0 notes" would only make it look risky.
  return parts.length === 0 ? undone : `${parts.join(" and ")} inside it will be deleted too. ${undone}`;
};
