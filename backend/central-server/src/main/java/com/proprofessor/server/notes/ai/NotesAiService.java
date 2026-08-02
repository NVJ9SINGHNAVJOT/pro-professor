package com.proprofessor.server.notes.ai;

import com.proprofessor.server.chat.InferenceOptions;
import com.proprofessor.server.chat.provider.ChatCompletionClient;
import com.proprofessor.server.chat.provider.dto.ChatMessage;
import com.proprofessor.server.common.db.NoteRevisionRow;
import com.proprofessor.server.common.db.NoteRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.model.ModelActivationService;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.notes.Frontmatter;
import com.proprofessor.server.notes.NotesService;
import com.proprofessor.server.notes.ai.dto.NoteAiRequest;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteRevisionSummary;
import com.proprofessor.server.notes.dto.NoteUpdateRequest;
import com.proprofessor.server.notes.repository.NotesRepository;
import com.proprofessor.server.settings.SettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI note actions: rewrite/summarize/continue a note via a local model
 * (Ollama / AI service through the OpenAI-compatible chat path).
 *
 * <p>Two shapes of action, see {@link Action}. {@code UPDATE} is a rewrite, so the model returns
 * the complete note. {@code SUMMARIZE} and {@code CONTINUE} return only the new text, delimited,
 * and the server splices it into the stored note — asking a local model to echo a long note back
 * verbatim just to add one section makes it drift, which reads as the AI mangling the note.
 *
 * <p>Either way the prior content is snapshotted into {@code note_revisions} before it is
 * overwritten, so every AI edit is reversible.
 */
@Service
public class NotesAiService {

    /** What the model is allowed to assume about the note app's Markdown dialect. */
    private static final String MARKDOWN_DIALECT = """
            The app renders GitHub-flavored Markdown, KaTeX math ($...$), Obsidian-style [[wiki-links]] and \
            ![[embeds]], > [!note] callouts, #tags, and ```mermaid diagram fences — use them where helpful. \
            Images come in two forms: ![[file.png]] embeds a file already uploaded to the app, and \
            ![alt](https://...) embeds one by URL. Only reference images that already appear in the note or \
            that the task gives you — never invent a filename or a URL.""";

    /** House style for flow diagrams; the full table lives in {@code skills/pro-professor-notes/SKILL.md}. */
    private static final String MERMAID_NUMBERING = """
            When a mermaid diagram shows a flow, label its edges with step numbers: 1, 2, 3 in order; \
            2a/2b for branches where only one is taken; 4.1/4.2 where every branch is taken; the same \
            number repeated on both edges where branches rejoin. Leave structural edges (an import, \
            "depends on") unlabelled, and leave sequence and state diagrams unnumbered.""";

    /** For {@link Action#UPDATE}, the one action whose result legitimately is the whole note. */
    private static final String FULL_NOTE_SYSTEM_PROMPT = """
            You are a note-editing assistant inside a Markdown note app. \
            You will be given a note and a task; respond with ONLY the complete updated Markdown note. \
            Do not add explanations before or after it, and do not wrap the whole note in a code fence. \
            Preserve the YAML frontmatter block (--- ... ---) when present, updating it only when the task asks. \
            """ + MARKDOWN_DIALECT + " " + MERMAID_NUMBERING;

    /**
     * For the fragment actions. The delimiter is what makes the result identifiable: a model that
     * ignores "fragment only" and echoes the note around its answer still yields a clean splice,
     * and a preamble ("Sure! Here's a summary:") falls outside the tag and is dropped. Shaped after
     * {@code ChatService.AUDIO_TRANSCRIPT_INSTRUCTION}, which uses the same technique on audio turns.
     */
    private static final String FRAGMENT_SYSTEM_PROMPT = """
            You are a note-editing assistant inside a Markdown note app. \
            You will be given a note and a task asking for ONE piece of new text — never the whole note. \
            Wrap your answer in the XML-style tag the task names and write nothing outside it: no \
            preamble, no explanation, no code fence, and no copy of the note you were given. \
            For example, when the task asks for <summary>: <summary>This note covers X and Y.</summary> \
            Always output the tagged block first, before anything else. \
            """ + MARKDOWN_DIALECT + " " + MERMAID_NUMBERING;

    private static final Pattern WRAPPING_FENCE =
            Pattern.compile("\\A```[a-zA-Z]*\\s*\\n(.*)\\n```\\s*\\z", Pattern.DOTALL);
    private static final Pattern FENCE_LINE = Pattern.compile("^\\s*(```|~~~)");
    private static final Pattern HEADING_LINE = Pattern.compile("^(#{1,6})\\s+(.*)$");
    private static final Pattern LEADING_SUMMARY_HEADING = Pattern.compile("\\A#{1,6}\\s*summary\\s*\\n",
            Pattern.CASE_INSENSITIVE);

    /** How much of the note's opening a fragment must reproduce before it counts as an echo. */
    private static final int ECHO_PREFIX_CHARS = 120;
    /** Below this, a note is too short for the echo check to distinguish a summary from a copy. */
    private static final int ECHO_MIN_BODY_CHARS = 80;

    /** Streams the whole note back into the editor buffer as it arrives. */
    private static final String MODE_REPLACE = "replace";
    /** Streams a fragment the server splices in; the buffer is left alone until the refetch. */
    private static final String MODE_FRAGMENT = "fragment";

    /**
     * The three note actions. {@code mode} tells the frontend whether the stream is the new note or
     * just a piece of one; {@code tag} is the delimiter a fragment action asks the model to wrap its
     * answer in ({@code null} for the full-note action).
     */
    public enum Action {
        UPDATE(MODE_REPLACE, null),
        SUMMARIZE(MODE_FRAGMENT, "summary"),
        CONTINUE(MODE_FRAGMENT, "continuation");

        private final String mode;
        private final String tag;

        Action(String mode, String tag) {
            this.mode = mode;
            this.tag = tag;
        }

        public String mode() {
            return mode;
        }

        public String tag() {
            return tag;
        }
    }

    /** Streaming callbacks for an AI note action (mirrors {@code ChatStreamListener}). */
    public interface NoteAiStreamListener {
        /** @param mode {@code replace} when the stream is the new note, {@code fragment} when it is a piece of one */
        void onStart(long noteId, String mode);

        void onToken(String delta);

        void onComplete(long noteId, long revisionId);
    }

    private final NotesRepository notesRepository;
    private final NotesService notesService;
    private final ChatCompletionClient chatCompletionClient;
    private final ModelActivationService modelActivationService;
    private final SettingsService settingsService;

    public NotesAiService(
            NotesRepository notesRepository,
            NotesService notesService,
            ChatCompletionClient chatCompletionClient,
            ModelActivationService modelActivationService,
            SettingsService settingsService) {
        this.notesRepository = notesRepository;
        this.notesService = notesService;
        this.chatCompletionClient = chatCompletionClient;
        this.modelActivationService = modelActivationService;
        this.settingsService = settingsService;
    }

    /**
     * Runs an AI action over the note and saves the result. Tokens stream to the
     * listener as they arrive; the note is only overwritten (with a prior snapshot)
     * once the full reply has been received.
     */
    public void streamNoteAction(long noteId, Action action, NoteAiRequest request, NoteAiStreamListener listener) {
        NoteRow note = notesRepository.findById(noteId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found: " + noteId));
        String userPrompt = buildPrompt(action, request, note.content());

        listener.onStart(noteId, action.mode());
        String reply = streamFromLocalModel(request, action, userPrompt, listener);

        String updated = action.tag() == null
                ? requireNonEmpty(stripWrappingFence(reply).trim(), "note")
                : applyFragment(action, note.content(), reply);
        long revisionId = notesRepository.insertRevision(noteId, note.content());
        notesService.updateNote(noteId, new NoteUpdateRequest(null, updated));
        listener.onComplete(noteId, revisionId);
    }

    public List<NoteRevisionSummary> listRevisions(long noteId) {
        requireNote(noteId);
        return notesRepository.findRevisionsByNoteId(noteId).stream()
                .map(revision -> new NoteRevisionSummary(revision.id(), revision.createdAt()))
                .toList();
    }

    /** Restores a snapshot — the current content is itself snapshotted first, so a restore is undoable. */
    public NoteDetail restoreRevision(long noteId, long revisionId) {
        NoteRow note = requireNote(noteId);
        NoteRevisionRow revision = notesRepository.findRevisionById(noteId, revisionId)
                .orElseThrow(() -> new ResourceNotFoundException("Revision not found: " + revisionId));
        notesRepository.insertRevision(noteId, note.content());
        return notesService.updateNote(noteId, new NoteUpdateRequest(null, revision.content()));
    }

    private String streamFromLocalModel(NoteAiRequest request, Action action, String userPrompt,
                                        NoteAiStreamListener listener) {
        ModelProvider provider = resolveLocalProvider(request.provider());
        if (request.model() == null || request.model().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "A model is required for the local provider.");
        }
        List<ChatMessage> messages = List.of(
                new ChatMessage("system", action.tag() == null ? FULL_NOTE_SYSTEM_PROMPT : FRAGMENT_SYSTEM_PROMPT),
                new ChatMessage("user", userPrompt));
        InferenceOptions options = settingsService.notesInferenceOptions();

        modelActivationService.acquireForChat(provider, request.model());
        try {
            return chatCompletionClient.streamChat(
                    provider, request.model(), messages, options,
                    listener::onToken,
                    thinking -> {
                        // reasoning tokens are not part of the note — drop them
                    },
                    metrics -> {
                        // note actions surface no metrics
                    });
        } finally {
            modelActivationService.releaseAfterChat();
        }
    }

    private static ModelProvider resolveLocalProvider(String provider) {
        if (provider == null) {
            throw new AppException(HttpStatus.BAD_REQUEST, "A provider is required (ollama or ai-service).");
        }
        return switch (provider.toLowerCase().replace('_', '-')) {
            case "ollama" -> ModelProvider.OLLAMA;
            case "ai-service" -> ModelProvider.AI_SERVICE;
            default -> throw new AppException(HttpStatus.BAD_REQUEST, "Unknown provider: " + provider);
        };
    }

    private static String buildPrompt(Action action, NoteAiRequest request, String content) {
        return switch (action) {
            case UPDATE -> {
                if (request.instruction() == null || request.instruction().isBlank()) {
                    throw new AppException(HttpStatus.BAD_REQUEST, "An instruction is required for an AI update.");
                }
                yield "Task: apply this instruction to the note.\nInstruction: " + request.instruction().trim()
                        + "\n\nCurrent note:\n" + content;
            }
            // The fragment actions are fed the body only — the YAML block is noise for both tasks,
            // and the server puts the result back in the right place itself.
            case SUMMARIZE -> "Task: write a concise summary of the note below, wrapped in "
                    + "<summary></summary>. Write the summary text only — no heading, no note.\n\nNote:\n"
                    + Frontmatter.parse(content).body();
            case CONTINUE -> "Task: continue writing this note from where it ends, matching its style and "
                    + "structure. Wrap the continuation in <continuation></continuation>. Write only the new "
                    + "text — do not repeat the note.\n\nNote:\n" + Frontmatter.parse(content).body();
        };
    }

    /**
     * Turns a fragment action's reply into the note's new content.
     *
     * <p>The model is asked to delimit its answer, which is what makes it identifiable: everything
     * outside the tag — a preamble, a trailing remark, or a copy of the note the model echoed around
     * its answer — is discarded here. A missing tag means the format was ignored, and the whole
     * reply is taken as the fragment. Either way the result has to survive the echo check before it
     * is allowed near the note.
     */
    private String applyFragment(Action action, String content, String reply) {
        String body = Frontmatter.parse(content).body();
        String extracted = extractBlock(reply, action.tag());
        boolean tagged = extracted != null;

        String fragment = stripWrappingFence(tagged ? extracted : reply).trim();
        if (action == Action.SUMMARIZE) {
            fragment = LEADING_SUMMARY_HEADING.matcher(fragment).replaceFirst("").trim();
        }
        fragment = requireNonEmpty(fragment, action.tag());
        // Checked whether or not the model used the tag: wrapping output in a delimiter is the easy
        // half of the instruction and condensing the note is the hard half, so a model can well
        // comply with the format while handing the note straight back inside it.
        if (looksLikeEcho(fragment, body)) {
            throw new AppException(HttpStatus.BAD_GATEWAY, "The model returned the whole note instead of a "
                    + action.tag() + " — try again or pick a different model.");
        }

        return action == Action.SUMMARIZE
                ? applySummary(content, fragment)
                : content.stripTrailing() + "\n\n" + fragment;
    }

    /**
     * The text inside {@code <tag>…</tag>}, or {@code null} when the opening tag never appears.
     * An opening tag with no closing one means the model was cut off mid-block (a token cap), so
     * the remainder is salvaged rather than thrown away.
     */
    private static String extractBlock(String reply, String tag) {
        Matcher block = Pattern.compile("<" + tag + ">(.*?)</" + tag + ">",
                Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(reply);
        if (block.find()) {
            return block.group(1);
        }
        Matcher open = Pattern.compile("<" + tag + ">", Pattern.CASE_INSENSITIVE).matcher(reply);
        return open.find() ? reply.substring(open.end()) : null;
    }

    /**
     * Whether the fragment is really the note handed back. Keyed on the note's opening rather than
     * on length: a legitimate continuation can be long, but nothing legitimate reproduces the first
     * {@link #ECHO_PREFIX_CHARS} characters of the note verbatim. Short notes are exempt — there the
     * check can't tell a summary from a copy.
     */
    private static boolean looksLikeEcho(String fragment, String body) {
        String normalizedBody = normalizeWhitespace(body);
        if (normalizedBody.length() < ECHO_MIN_BODY_CHARS) {
            return false;
        }
        String opening = normalizedBody.substring(0, Math.min(ECHO_PREFIX_CHARS, normalizedBody.length()));
        return normalizeWhitespace(fragment).contains(opening);
    }

    private static String normalizeWhitespace(String text) {
        return text.replaceAll("\\s+", " ").trim();
    }

    private static String requireNonEmpty(String value, String what) {
        if (value.isEmpty()) {
            throw new AppException(HttpStatus.BAD_GATEWAY,
                    "The model returned an empty " + what + " — nothing was saved.");
        }
        return value;
    }

    /**
     * Puts the summary into the note: replacing an existing Summary section in place (at whatever
     * heading level it already uses), or inserting one after the frontmatter and any leading H1
     * title. Everything else is left byte-for-byte alone — a Summary heading inside a fenced code
     * block is not a section and never matches.
     */
    private static String applySummary(String content, String summary) {
        List<String> lines = new ArrayList<>(Arrays.asList(content.split("\n", -1)));
        boolean inFence = false;
        int start = -1;
        int depth = 0;
        int end = lines.size();

        for (int i = 0; i < lines.size(); i++) {
            if (FENCE_LINE.matcher(lines.get(i)).find()) {
                inFence = !inFence;
                continue;
            }
            if (inFence) {
                continue;
            }
            Matcher heading = HEADING_LINE.matcher(lines.get(i));
            if (!heading.matches()) {
                continue;
            }
            if (start == -1) {
                if (heading.group(2).trim().equalsIgnoreCase("Summary")) {
                    start = i;
                    depth = heading.group(1).length();
                }
            } else if (heading.group(1).length() <= depth) {
                end = i;
                break;
            }
        }

        if (start != -1) {
            List<String> block = new ArrayList<>(List.of("#".repeat(depth) + " Summary", "", summary));
            if (end < lines.size()) {
                block.add("");
            }
            List<String> updated = new ArrayList<>(lines.subList(0, start));
            updated.addAll(block);
            updated.addAll(lines.subList(end, lines.size()));
            return String.join("\n", updated);
        }

        int insertAt = frontmatterEnd(lines);
        for (int i = insertAt; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) {
                continue;
            }
            if (lines.get(i).startsWith("# ")) {
                insertAt = i + 1;
            }
            break;
        }
        List<String> block = new ArrayList<>();
        if (insertAt > 0 && !lines.get(insertAt - 1).isBlank()) {
            block.add("");
        }
        block.addAll(List.of("## Summary", "", summary));
        if (insertAt < lines.size() && !lines.get(insertAt).isBlank()) {
            block.add("");
        }
        lines.addAll(insertAt, block);
        return String.join("\n", lines);
    }

    /** The index of the first line after the YAML frontmatter block, or 0 when there isn't one. */
    private static int frontmatterEnd(List<String> lines) {
        if (lines.isEmpty() || !lines.get(0).trim().equals("---")) {
            return 0;
        }
        for (int i = 1; i < lines.size(); i++) {
            if (lines.get(i).trim().equals("---")) {
                return i + 1;
            }
        }
        return 0;
    }

    /** Models sometimes wrap the whole note in one Markdown fence despite instructions — unwrap it. */
    private static String stripWrappingFence(String reply) {
        Matcher matcher = WRAPPING_FENCE.matcher(reply.trim());
        return matcher.matches() ? matcher.group(1) : reply;
    }

    private NoteRow requireNote(long noteId) {
        return notesRepository.findById(noteId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found: " + noteId));
    }
}
