import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Container that scopes the rendered-Markdown styles in markdown.css.
 *
 * Wraps `<Markdown>` rather than being folded into it so callers can place siblings
 * inside the same styled box — the chat streaming cursor sits after the last
 * paragraph and relies on the `> *:last-child` margin rule seeing it.
 */
const MarkdownBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("markdown-body wrap-break-word", className)}>{children}</div>
);

export default MarkdownBody;
