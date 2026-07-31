import { ArrowUpRightIcon, HashIcon, LinkIcon, ListTreeIcon } from "lucide-react";
import { useNavigate } from "react-router";
import type { NoteSummary } from "@/services/operations/notes/notes.route";
import { extractOutline, extractWikiRefs } from "@/modules/notes/utils";
import { OUTLINE_INDENT_PX } from "@/modules/notes/constants";
import { ROUTES } from "@/constants/routes";

interface ContextPanelProps {
  /** Notes linking here — loaded with the note by the route loader. */
  backlinks: NoteSummary[];
  content: string;
  tags: string[];
  /** Wiki-link navigation (resolves by title; opens a draft when missing). */
  onWikiClick: (target: string) => void;
  /** Scrolls the preview to one of this note's headings — no navigation, so nothing refetches. */
  onHeadingClick: (heading: string) => void;
}

/**
 * Backlinks, outbound links, outline, and tags of the active note — the Context tab of
 * {@link RightRail}, which owns the pane chrome around it.
 */
const ContextPanel = ({ backlinks, content, tags, onWikiClick, onHeadingClick }: ContextPanelProps) => {
  const navigate = useNavigate();

  const outline = extractOutline(content);
  const outbound = extractWikiRefs(content);

  return (
    <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-y-5 overflow-y-auto p-3">
      <section>
        <div className="flex items-center gap-x-2 pb-1.5 caption-small-medium text-neutral-500">
          <LinkIcon className="size-3.5" />
          Backlinks
        </div>
        {backlinks.length === 0 ? (
          <div className="caption-regular text-neutral-600">No backlinks</div>
        ) : (
          <ul>
            {backlinks.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.NOTES_DETAIL(note.id))}
                  className="w-full cursor-pointer truncate rounded px-1 py-0.5 text-left para-small-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  title={note.title}
                >
                  {note.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center gap-x-2 pb-1.5 caption-small-medium text-neutral-500">
          <ArrowUpRightIcon className="size-3.5" />
          Outgoing links
        </div>
        {outbound.length === 0 ? (
          <div className="caption-regular text-neutral-600">No outgoing links</div>
        ) : (
          <ul>
            {outbound.map((target) => (
              <li key={target}>
                <button
                  type="button"
                  onClick={() => onWikiClick(target)}
                  className="w-full cursor-pointer truncate rounded px-1 py-0.5 text-left para-small-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  title={target}
                >
                  {target}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center gap-x-2 pb-1.5 caption-small-medium text-neutral-500">
          <ListTreeIcon className="size-3.5" />
          Outline
        </div>
        {outline.length === 0 ? (
          <div className="caption-regular text-neutral-600">No headings</div>
        ) : (
          <ul>
            {outline.map((item, index) => (
              <li key={index} style={{ paddingLeft: `${(item.depth - 1) * OUTLINE_INDENT_PX}px` }}>
                <button
                  type="button"
                  onClick={() => onHeadingClick(item.text)}
                  className="w-full cursor-pointer truncate rounded px-1 py-0.5 text-left para-small-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  title={item.text}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center gap-x-2 pb-1.5 caption-small-medium text-neutral-500">
          <HashIcon className="size-3.5" />
          Tags
        </div>
        {tags.length === 0 ? (
          <div className="caption-regular text-neutral-600">No tags</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-neutral-800 px-2 py-0.5 caption-small-regular text-neutral-300"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ContextPanel;
