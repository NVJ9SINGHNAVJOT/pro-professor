package com.proprofessor.server.notes;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts the Obsidian-style references from a note body (frontmatter already stripped):
 * wiki-links {@code [[Note]]} / {@code [[Note|alias]]} / {@code [[Note#Heading]]}, embeds
 * {@code ![[Note]]}, Markdown links to notes {@code [text](Other%20Note)}, and inline
 * {@code #tags}. Code blocks and inline code are ignored, matching how Obsidian parses.
 */
public final class LinkParser {

    /** One outgoing reference: the target note title as written, and whether it's a link or embed. */
    public record Link(String targetRef, String type) {
    }

    public record ParsedRefs(List<Link> links, List<String> tags) {
    }

    public static final String TYPE_LINK = "link";
    public static final String TYPE_EMBED = "embed";

    private static final Pattern FENCED_CODE = Pattern.compile("^(```|~~~).*?^\\1\\s*$", Pattern.DOTALL | Pattern.MULTILINE);
    private static final Pattern INLINE_CODE = Pattern.compile("`[^`\n]*`");
    private static final Pattern WIKI_REF = Pattern.compile("(!?)\\[\\[([^\\[\\]]+)]]");
    /** [text](target) — but not ![alt](image) and not a wiki-link's inner text. */
    private static final Pattern MD_LINK = Pattern.compile("(?<!!)\\[[^\\[\\]]*]\\(([^()\\s]+)\\)");
    private static final Pattern INLINE_TAG = Pattern.compile("(?<=^|[\\s(])#([A-Za-z][\\w/-]*)");
    private static final int MAX_REF_LENGTH = 255;

    private LinkParser() {
    }

    public static ParsedRefs parse(String body) {
        String text = INLINE_CODE.matcher(FENCED_CODE.matcher(body).replaceAll("")).replaceAll("");

        Set<Link> links = new LinkedHashSet<>();
        Matcher wiki = WIKI_REF.matcher(text);
        while (wiki.find()) {
            String target = cleanWikiTarget(wiki.group(2));
            if (target != null) {
                links.add(new Link(target, wiki.group(1).isEmpty() ? TYPE_LINK : TYPE_EMBED));
            }
        }
        Matcher md = MD_LINK.matcher(text);
        while (md.find()) {
            String target = cleanMdTarget(md.group(1));
            if (target != null) {
                links.add(new Link(target, TYPE_LINK));
            }
        }

        List<String> tags = new ArrayList<>();
        Matcher tag = INLINE_TAG.matcher(text);
        while (tag.find()) {
            String name = tag.group(1).toLowerCase(Locale.ROOT);
            if (!tags.contains(name)) tags.add(name);
        }
        return new ParsedRefs(new ArrayList<>(links), tags);
    }

    /** {@code Note#Heading|alias} → {@code Note}. */
    private static String cleanWikiTarget(String raw) {
        String target = raw.split("[#|]", 2)[0].trim();
        return normalize(target);
    }

    /**
     * A Markdown link target counts as a note reference only when it's a plain relative
     * name (no scheme, no path, no anchor-only link) — e.g. {@code Other%20Note} or
     * {@code Other Note.md}.
     */
    private static String cleanMdTarget(String raw) {
        if (raw.contains("://") || raw.startsWith("#") || raw.startsWith("/")
                || raw.contains(":") || raw.contains("/")) {
            return null;
        }
        String target = URLDecoder.decode(raw, StandardCharsets.UTF_8);
        int anchor = target.indexOf('#');
        if (anchor >= 0) target = target.substring(0, anchor);
        if (target.toLowerCase(Locale.ROOT).endsWith(".md")) {
            target = target.substring(0, target.length() - 3);
        }
        return normalize(target.trim());
    }

    private static String normalize(String target) {
        if (target.isBlank()) return null;
        return target.length() > MAX_REF_LENGTH ? target.substring(0, MAX_REF_LENGTH) : target;
    }
}
