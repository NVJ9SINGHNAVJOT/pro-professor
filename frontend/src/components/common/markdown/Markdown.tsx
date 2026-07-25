import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import MermaidBlock from "@/components/common/MermaidBlock";
import { cn } from "@/lib/utils";

/* ── Obsidian-style callouts ──────────────────────────────────────────────────
 * Turns `> [!note] Optional title` blockquotes into styled callout boxes.
 * Implemented as a tiny hand-rolled remark transform (no unist-util-visit
 * dependency): it walks the mdast tree, and for a blockquote whose first text
 * starts with the `[!type]` marker, strips the marker, prepends a title
 * paragraph, and tags both nodes with CSS classes (see index.css `.callout`). */

interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  data?: { hProperties?: Record<string, string> };
}

const CALLOUT_MARKER = /^\[!(\w+)\][+-]?[ \t]*([^\n]*)\n?([\s\S]*)$/;

const transformCallout = (blockquote: MdNode) => {
  const paragraph = blockquote.children?.[0];
  if (!paragraph || paragraph.type !== "paragraph") return;
  const text = paragraph.children?.[0];
  if (!text || text.type !== "text" || !text.value) return;

  const match = CALLOUT_MARKER.exec(text.value);
  if (!match) return;
  const [, rawType, customTitle, rest] = match;
  const type = rawType.toLowerCase();

  // Strip the marker line; drop the paragraph entirely if it only held the marker.
  if (rest) {
    text.value = rest;
  } else {
    paragraph.children!.shift();
    // an immediately following break node would render a stray leading newline
    if (paragraph.children![0]?.type === "break") paragraph.children!.shift();
    if (paragraph.children!.length === 0) blockquote.children!.shift();
  }

  const title = customTitle.trim() || type.charAt(0).toUpperCase() + type.slice(1);
  blockquote.children!.unshift({
    type: "paragraph",
    data: { hProperties: { className: "callout-title" } },
    children: [{ type: "text", value: title }],
  });
  blockquote.data = {
    ...blockquote.data,
    hProperties: { ...blockquote.data?.hProperties, className: `callout callout-${type}` },
  };
};

const walkCallouts = (node: MdNode) => {
  if (node.type === "blockquote") transformCallout(node);
  node.children?.forEach(walkCallouts);
};

const remarkCallouts = () => (tree: MdNode) => walkCallouts(tree);

/* ── Obsidian-style wiki-links ────────────────────────────────────────────────
 * Turns `[[Note]]` / `[[Note#Heading|alias]]` into link nodes with a `#wiki:`
 * URL and `![[Note]]` embeds into `#wiki-embed:` links; the `a` component
 * override below routes them to the host module's handlers. The heading part
 * rides along URL-encoded after a second `#`. Text inside code spans/blocks is
 * untouched (those are separate mdast node types). */

const WIKI_REF = /(!?\[\[[^[\]]+\]\])/;
const WIKI_PARTS = /^(!?)\[\[([^[\]|]+?)(?:\|([^[\]]*))?\]\]$/;

const wikiUrl = (embed: boolean, target: string, heading?: string) =>
  `#wiki${embed ? "-embed" : ""}:${encodeURIComponent(target)}${heading ? `#${encodeURIComponent(heading)}` : ""}`;

const transformWikiText = (parent: MdNode, index: number): number => {
  const node = parent.children![index];
  if (!node.value || !WIKI_REF.test(node.value)) return 1;

  const replacements: MdNode[] = [];
  for (const piece of node.value.split(WIKI_REF)) {
    const match = WIKI_PARTS.exec(piece);
    if (!match) {
      if (piece) replacements.push({ type: "text", value: piece });
      continue;
    }
    const [, bang, rawTarget, alias] = match;
    const [targetPart, headingPart] = rawTarget.split(/#(.*)/s);
    const target = targetPart.trim() || rawTarget.trim();
    const heading = headingPart?.trim() || undefined;
    const label = alias?.trim() || rawTarget.trim();
    replacements.push({
      type: "link",
      url: wikiUrl(bang === "!", target, heading),
      children: [{ type: "text", value: label }],
    });
  }
  parent.children!.splice(index, 1, ...replacements);
  return replacements.length;
};

const walkWikiLinks = (node: MdNode) => {
  if (node.type === "code" || node.type === "inlineCode" || node.type === "link") return;
  if (!node.children) return;
  for (let i = 0; i < node.children.length; ) {
    const child = node.children[i];
    if (child.type === "text") {
      i += transformWikiText(node, i);
    } else {
      walkWikiLinks(child);
      i += 1;
    }
  }
};

const remarkWikiLinks = () => (tree: MdNode) => walkWikiLinks(tree);

/* ── Component ───────────────────────────────────────────────────────────── */

/** Handlers a host module (notes) supplies to make wiki-links live. */
export interface WikiHandlers {
  /** Navigate to (or offer to create) the target note; scroll to `heading` when given. */
  onLinkClick: (target: string, heading?: string) => void;
  /** Whether a note with this title exists — missing links render dimmed. */
  linkExists: (target: string) => boolean;
  /** Renders a `![[target]]`/`![[target#Heading]]` transclusion; omit to fall back to a plain wiki-link. */
  renderEmbed?: (target: string, heading?: string) => ReactNode;
  /** Image `![[file.png]]` embed filename → direct storage-server URL, resolved by the backend at note load. */
  embedUrls?: Record<string, string>;
}

const WIKI_LINK_PREFIX = "#wiki:";
const WIKI_EMBED_PREFIX = "#wiki-embed:";

const parseWikiHref = (href: string, prefix: string): { target: string; heading?: string } => {
  const [target, heading] = href.slice(prefix.length).split("#");
  return { target: decodeURIComponent(target), heading: heading ? decodeURIComponent(heading) : undefined };
};

/**
 * ```mermaid fences render as diagrams (lazy-loaded); everything else stays a
 * plain code block.
 */
const baseComponents: Components = {
  code: ({ className, children, ...props }) => {
    if (/language-mermaid\b/.test(className ?? "")) {
      return <MermaidBlock code={String(children).trim()} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

const wikiComponents = (wiki: WikiHandlers): Components => ({
  ...baseComponents,
  a: ({ href, children, ...props }) => {
    if (href?.startsWith(WIKI_EMBED_PREFIX) && wiki.renderEmbed) {
      const { target, heading } = parseWikiHref(href, WIKI_EMBED_PREFIX);
      return <>{wiki.renderEmbed(target, heading)}</>;
    }
    if (href?.startsWith(WIKI_LINK_PREFIX) || href?.startsWith(WIKI_EMBED_PREFIX)) {
      const prefix = href.startsWith(WIKI_LINK_PREFIX) ? WIKI_LINK_PREFIX : WIKI_EMBED_PREFIX;
      const { target, heading } = parseWikiHref(href, prefix);
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            wiki.onLinkClick(target, heading);
          }}
          title={wiki.linkExists(target) ? target : `Create "${target}"`}
          className={cn("cursor-pointer", !wiki.linkExists(target) && "opacity-60 decoration-dashed")}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  },
});

interface MarkdownProps {
  children: string;
  /** Enables Obsidian wiki-link/embed handling — supplied by the notes module. */
  wiki?: WikiHandlers;
}

/**
 * Shared Markdown renderer: GitHub-flavored + KaTeX math + Obsidian-style callouts,
 * plus optional wiki-link/embed support. Memoized on its source so a re-render that
 * doesn't change the string (e.g. while an unclosed math token is being withheld
 * during streaming) skips re-parsing.
 */
const Markdown = memo(({ children, wiki }: MarkdownProps) => (
  <ReactMarkdown
    remarkPlugins={wiki ? [remarkGfm, remarkMath, remarkCallouts, remarkWikiLinks] : [remarkGfm, remarkMath, remarkCallouts]}
    rehypePlugins={[rehypeKatex]}
    components={wiki ? wikiComponents(wiki) : baseComponents}
  >
    {children}
  </ReactMarkdown>
));
Markdown.displayName = "Markdown";

export default Markdown;
