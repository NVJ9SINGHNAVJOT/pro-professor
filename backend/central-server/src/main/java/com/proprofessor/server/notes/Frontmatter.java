package com.proprofessor.server.notes;

import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parsed YAML frontmatter of a note: the leading {@code ---\n…\n---} block, in Obsidian's format.
 * Parsing uses the SnakeYAML that Spring Boot already ships (it reads application.yml with it) —
 * with the safe constructor, since note content is arbitrary pasted text.
 *
 * @param map  every frontmatter key/value ({@code {}} when the note has no block or it is invalid YAML)
 * @param body the note content without the frontmatter block (what the preview should render)
 */
public record Frontmatter(Map<String, Object> map, String body) {

    private static final Pattern BLOCK = Pattern.compile("\\A---\\s*\\n(.*?)\\n---\\s*(?:\\n|\\z)", Pattern.DOTALL);

    public static Frontmatter parse(String content) {
        if (content == null) return new Frontmatter(Map.of(), "");
        Matcher matcher = BLOCK.matcher(content);
        if (!matcher.find()) return new Frontmatter(Map.of(), content);

        String body = content.substring(matcher.end());
        try {
            Object parsed = new Yaml(new SafeConstructor(new LoaderOptions())).load(matcher.group(1));
            if (parsed instanceof Map<?, ?> raw) {
                Map<String, Object> map = new LinkedHashMap<>();
                raw.forEach((k, v) -> map.put(String.valueOf(k), v));
                return new Frontmatter(map, body);
            }
        } catch (RuntimeException ignored) {
            // malformed YAML — treat the note as having no frontmatter rather than failing the save
        }
        return new Frontmatter(Map.of(), body);
    }

    /** The {@code title} value, or {@code null} when absent/blank. */
    public String title() {
        Object title = map.get("title");
        if (title == null || String.valueOf(title).isBlank()) return null;
        return String.valueOf(title).trim();
    }

    /**
     * The {@code tags} value normalized to lowercase names without a leading {@code #}.
     * Accepts both YAML list form and a single comma-separated string.
     */
    public List<String> tags() {
        Object tags = map.get("tags");
        List<String> names = new ArrayList<>();
        if (tags instanceof List<?> list) {
            list.forEach(tag -> addTag(names, tag));
        } else if (tags instanceof String s) {
            for (String part : s.split(",")) addTag(names, part);
        }
        return names;
    }

    private static void addTag(List<String> names, Object raw) {
        if (raw == null) return;
        String name = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        if (name.startsWith("#")) name = name.substring(1);
        if (!name.isEmpty() && !names.contains(name)) names.add(name);
    }
}
