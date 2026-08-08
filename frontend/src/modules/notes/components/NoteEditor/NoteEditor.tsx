import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TextareaHTMLAttributes } from "react";
import { TextareaInput } from "@/components/inputs/TextareaInput";
import type { Problem, ProblemSeverity } from "@/modules/notes/editor/lintMarkdown";
import { EDITOR_GUTTER, EDITOR_TEXT_STYLE, TOOLTIP_CLEARANCE, TOOLTIP_MAX_WIDTH } from "@/modules/notes/constants";
import { cn } from "@/lib/utils";

/* ── Line numbers + inline problem markers ────────────────────────────────────
 * Text inside a <textarea> can't be styled, so a mirror layer sits behind a
 * transparent-background textarea: the same text, wrapped identically, but
 * invisible — it exists only to carry a line number and a squiggle per line.
 * Because the mirror wraps exactly like the textarea, a wrapped line's markers
 * line up with no measurement code at all; the browser does the work. This is
 * the same trick caretPosition.ts uses to place the slash menu.
 *
 * The textarea itself is untouched and its ref is forwarded straight through, so
 * every existing consumer (textActions, the slash menu, jumpToLine, AI streaming)
 * keeps working against a plain textarea.
 */

const SEVERITY_RANK: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };

/** One line can hold several problems; the squiggle takes the colour of the worst. */
const worstSeverity = (problems: Problem[]) =>
  problems.reduce(
    (worst, problem) => (SEVERITY_RANK[problem.severity] < SEVERITY_RANK[worst] ? problem.severity : worst),
    problems[0].severity,
  );

const groupByLine = (problems: Problem[]) => {
  const byLine = new Map<number, Problem[]>();
  for (const problem of problems) {
    const existing = byLine.get(problem.line);
    if (existing) existing.push(problem);
    else byLine.set(problem.line, [problem]);
  }
  return byLine;
};

interface HoverState {
  line: number;
  problems: Problem[];
  /** Viewport coords of the hovered line's box; the tooltip hangs off one edge or the other. */
  lineTop: number;
  lineBottom: number;
  left: number;
  /** Near the bottom of the window there's no room underneath — sit above the line instead. */
  flip: boolean;
}

interface NoteEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> {
  value: string;
  /** Problems in this buffer, in line order (see lintMarkdown). */
  problems: Problem[];
}

const NoteEditor = memo(
  forwardRef<HTMLTextAreaElement, NoteEditorProps>(function NoteEditor(
    { value, problems, className, onScroll, ...props },
    ref,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [hover, setHover] = useState<HoverState | null>(null);

    const lines = value.split("\n");
    const byLine = groupByLine(problems);

    /** The caller's ref still has to receive the textarea itself. */
    const attachRef = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    const syncMirror = useCallback(() => {
      const textarea = innerRef.current;
      const mirror = mirrorRef.current;
      const content = contentRef.current;
      if (!textarea || !mirror || !content) return;
      // clientWidth, not offsetWidth: it excludes the scrollbar, which is exactly the width the
      // textarea wraps its text at. Getting this wrong desyncs every wrapped line.
      const width = `${textarea.clientWidth}px`;
      if (content.style.width !== width) content.style.width = width;
      if (mirror.scrollTop !== textarea.scrollTop) mirror.scrollTop = textarea.scrollTop;
    }, []);

    // After every render: typing can grow a scrollbar, which changes clientWidth *without*
    // resizing the textarea — so ResizeObserver alone would never hear about it.
    useLayoutEffect(syncMirror);

    // Resizes that don't re-render this component: the SplitPane divider and the rail's edge.
    useEffect(() => {
      const textarea = innerRef.current;
      if (!textarea) return;
      const observer = new ResizeObserver(syncMirror);
      observer.observe(textarea);
      return () => observer.disconnect();
    }, [syncMirror]);

    /** The mirror has to follow the textarea's scroll before anyone else reacts to it. */
    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      syncMirror();
      onScroll?.(e);
    };

    /** Hovering a problem line shows its messages — detected on the textarea, since the mirror
     *  can't take pointer events without stealing clicks from the editor. (Mouse tracking is this
     *  component's own; it deliberately overrides any onMouseMove/onMouseLeave from the caller.) */
    const handleMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
      const mirror = mirrorRef.current;
      if (!mirror || problems.length === 0) return;
      for (const [line, lineProblems] of byLine) {
        const element = mirror.querySelector(`[data-line="${line}"]`);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY < rect.bottom) {
          if (hover?.line !== line) {
            setHover({
              line,
              problems: lineProblems,
              lineTop: rect.top,
              lineBottom: rect.bottom,
              left: Math.min(rect.left, window.innerWidth - TOOLTIP_MAX_WIDTH - 8),
              flip: rect.bottom + TOOLTIP_CLEARANCE > window.innerHeight,
            });
          }
          return;
        }
      }
      if (hover) setHover(null);
    };

    return (
      <div className="relative h-full min-h-0">
        {/* Gutter backdrop — outside the scrolling mirror, so it stays put as the text moves. */}
        <div
          aria-hidden
          style={{ width: EDITOR_GUTTER }}
          className="absolute inset-y-0 left-0 border-r border-neutral-800 bg-neutral-900/40"
        />

        <div ref={mirrorRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            ref={contentRef}
            style={{ paddingLeft: EDITOR_GUTTER }}
            className={cn(EDITOR_TEXT_STYLE, "whitespace-pre-wrap wrap-break-word")}
          >
            {lines.map((line, index) => {
              const lineProblems = byLine.get(index + 1);
              return (
                <div key={index} data-line={index + 1} className="relative">
                  <span className="absolute right-full mr-3 w-7 text-right text-neutral-600 select-none">
                    {index + 1}
                  </span>
                  {/* Invisible rather than absent: its box is what gives the line its height. */}
                  <span className="invisible">{line || " "}</span>
                  {lineProblems && (
                    <span
                      className={cn(
                        "note-squiggle absolute inset-x-0 bottom-0",
                        `note-squiggle-${worstSeverity(lineProblems)}`,
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <TextareaInput
          {...props}
          ref={attachRef}
          value={value}
          onScroll={handleScroll}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          style={{ paddingLeft: EDITOR_GUTTER }}
          className={cn(
            "chat-scroll relative h-full min-h-0 resize-none rounded-none border-none bg-transparent focus:border-none",
            EDITOR_TEXT_STYLE,
            className,
          )}
        />

        {hover && (
          <div
            style={
              hover.flip
                ? { bottom: window.innerHeight - hover.lineTop + 4, left: hover.left }
                : { top: hover.lineBottom + 4, left: hover.left }
            }
            className="pointer-events-none fixed z-50 max-w-80 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 shadow-lg"
          >
            {hover.problems.map((problem, index) => (
              <p key={index} className="para-small-regular text-neutral-300">
                {problem.message}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }),
);
NoteEditor.displayName = "NoteEditor";

export default NoteEditor;
