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
import com.proprofessor.server.notes.NotesService;
import com.proprofessor.server.notes.ai.dto.NoteAiRequest;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteRevisionSummary;
import com.proprofessor.server.notes.dto.NoteUpdateRequest;
import com.proprofessor.server.notes.repository.NotesRepository;
import com.proprofessor.server.settings.SettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The AI note update: rewrite a note against an instruction via a local model
 * (Ollama / AI core through the OpenAI-compatible chat path).
 *
 * <p><strong>This service never writes to the note.</strong> It streams the proposed new note back
 * and stops there; the frontend stages it for review and the user applies it into the editor, which
 * then saves like any other edit. That review step is the safety net — which is why there is no
 * {@code note_revisions} snapshot on this path. {@link #restoreRevision} still writes one, so
 * restores stay undoable.
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

    /**
     * Mermaid's own syntax, not house style — kept apart from {@link #MERMAID_NUMBERING} because
     * that constant is the numbering convention, which {@code skills/pro-professor-notes/SKILL.md}
     * owns and must be kept in step with. A bare bracket in a label is a hard parse error (the
     * lexer reads "(" as the start of a round node even inside an edge label), so the diagram
     * renders as an error box rather than looking merely off-style.
     */
    private static final String MERMAID_SYNTAX = """
            In a mermaid diagram, wrap node and edge label text in double quotes whenever it contains \
            a bracket, brace, parenthesis, # or quote — write A -->|"Command (SET key value)"| B, \
            never A -->|Command (SET key value)| B. Unquoted brackets break the diagram entirely.""";

    /** The model's whole job: hand back the complete updated note, nothing else. */
    private static final String FULL_NOTE_SYSTEM_PROMPT = """
            You are a note-editing assistant inside a Markdown note app. \
            You will be given a note and a task; respond with ONLY the complete updated Markdown note. \
            Do not add explanations before or after it, and do not wrap the whole note in a code fence. \
            Preserve the YAML frontmatter block (--- ... ---) when present, updating it only when the task asks. \
            """ + MARKDOWN_DIALECT + " " + MERMAID_SYNTAX + " " + MERMAID_NUMBERING;

    /** Markers around the span a scoped edit may rewrite. Chosen to never occur in real Markdown. */
    private static final String SELECTION_OPEN = "<<<EDIT_THIS>>>";
    private static final String SELECTION_CLOSE = "<<<END_EDIT_THIS>>>";

    /**
     * The scoped counterpart of {@link #FULL_NOTE_SYSTEM_PROMPT}: the model still reads the whole
     * note, so it can match the surrounding style and reuse what is defined elsewhere in it, but it
     * may only answer with the marked span's replacement. Everything outside the markers is
     * therefore untouchable by construction — which is what lets the client splice the reply into an
     * exact range instead of replacing the buffer and hoping the rest came back unchanged.
     */
    private static final String SELECTION_SYSTEM_PROMPT = """
            You are a note-editing assistant inside a Markdown note app. \
            You will be given a Markdown note with one span marked by %s and %s, and a task. \
            Respond with ONLY the replacement text for that marked span — not the whole note, not the \
            markers, and no explanation before or after it. The rest of the note is context: read it, \
            but do not rewrite it and do not repeat it back. Keep the replacement's leading and \
            trailing whitespace consistent with the span you are replacing, and do not wrap it in a \
            code fence unless the span itself was fenced. \
            """.formatted(SELECTION_OPEN, SELECTION_CLOSE)
            + MARKDOWN_DIALECT + " " + MERMAID_SYNTAX + " " + MERMAID_NUMBERING;

    private static final Pattern WRAPPING_FENCE =
            Pattern.compile("\\A```[a-zA-Z]*\\s*\\n(.*)\\n```\\s*\\z", Pattern.DOTALL);

    /** How much of the system prompt a reply must reproduce before it counts as an echo of it. */
    private static final int ECHO_PREFIX_CHARS = 120;

    /** Streaming callbacks for an AI note update (mirrors {@code ChatStreamListener}). */
    public interface NoteAiStreamListener {
        void onStart(long noteId);

        void onToken(String delta);

        /** Generation finished and the proposal passed validation. Nothing has been written. */
        void onComplete(long noteId);
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
     * Generates the proposed new note and streams it to the listener as it arrives. The note is
     * <em>not</em> written — the caller stages the result for the user to apply or discard. A
     * proposal that fails validation throws instead of completing, so nothing bad reaches the
     * review pane.
     */
    public void streamNoteAction(long noteId, NoteAiRequest request, NoteAiStreamListener listener) {
        NoteRow note = requireNote(noteId);
        String selection = blankToNull(request.selection());
        String userPrompt = buildPrompt(request, note.content(), selection);
        String systemPrompt = selection == null ? FULL_NOTE_SYSTEM_PROMPT : SELECTION_SYSTEM_PROMPT;

        listener.onStart(noteId);
        String reply = streamFromLocalModel(request, systemPrompt, userPrompt, listener);

        // A scoped reply is *not* unwrapped: the span being replaced is very often a ```mermaid
        // fence, and stripping it would hand back a bare diagram body that no longer renders.
        String proposed = selection == null ? stripWrappingFence(reply) : stripSelectionMarkers(reply);
        rejectPromptEcho(requireNonEmpty(proposed.trim()), systemPrompt);
        listener.onComplete(noteId);
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

    private String streamFromLocalModel(NoteAiRequest request, String systemPrompt, String userPrompt,
                                        NoteAiStreamListener listener) {
        ModelProvider provider = resolveLocalProvider(request.provider());
        if (request.model() == null || request.model().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "A model is required for the local provider.");
        }
        List<ChatMessage> messages = List.of(
                new ChatMessage("system", systemPrompt),
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
            throw new AppException(HttpStatus.BAD_REQUEST, "A provider is required (ollama or ai-core).");
        }
        return switch (provider.toLowerCase().replace('_', '-')) {
            case "ollama" -> ModelProvider.OLLAMA;
            case "ai-core" -> ModelProvider.AI_CORE;
            default -> throw new AppException(HttpStatus.BAD_REQUEST, "Unknown provider: " + provider);
        };
    }

    /**
     * The task message. An empty note gets its own phrasing: ending the prompt with
     * "Current note:" and nothing after it leaves the model no content to anchor on, and a small
     * local model then hands back the last text it did see — its own system prompt.
     *
     * <p>With a selection, the note is sent whole with that span wrapped in markers, so the model
     * has the surrounding context but a single, unambiguous place to edit.
     */
    private static String buildPrompt(NoteAiRequest request, String content, String selection) {
        if (request.instruction() == null || request.instruction().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "An instruction is required for an AI update.");
        }
        String instruction = request.instruction().trim();
        String body = content == null ? "" : content;
        if (selection != null) {
            return "Task: rewrite ONLY the marked span according to the instruction, and reply with "
                    + "its replacement text alone.\nInstruction: " + instruction
                    + "\n\nNote:\n" + markSelection(body, selection);
        }
        return body.isBlank()
                ? "Task: the note is currently empty — write it from scratch.\nInstruction: " + instruction
                : "Task: apply this instruction to the note.\nInstruction: " + instruction
                        + "\n\nCurrent note:\n" + body;
    }

    /**
     * Wraps the selected span in the edit markers. The client sends the selected <em>text</em>
     * rather than offsets because it saves the note immediately before this runs, and that save
     * re-derives frontmatter — which can shift every offset in the buffer. A miss is a hard 400
     * rather than a silent whole-note rewrite: the client splices the reply into an exact range, so
     * quietly changing the scope under it would overwrite the wrong part of the note.
     */
    private static String markSelection(String body, String selection) {
        int at = body.indexOf(selection);
        if (at < 0) {
            throw new AppException(HttpStatus.BAD_REQUEST,
                    "The selected text is no longer in the saved note — reselect it and try again.");
        }
        return body.substring(0, at) + SELECTION_OPEN + selection + SELECTION_CLOSE
                + body.substring(at + selection.length());
    }

    /** Models echo the markers back now and then; they are scaffolding, never part of the note. */
    private static String stripSelectionMarkers(String reply) {
        return reply.replace(SELECTION_OPEN, "").replace(SELECTION_CLOSE, "");
    }

    /**
     * Rejects a reply that is the system prompt handed back rather than a note. Cheap insurance:
     * the proposal is only staged, but showing the user their own instructions as a "note" reads
     * as the feature being broken, which is exactly what it is when this fires.
     */
    private static void rejectPromptEcho(String proposed, String systemPrompt) {
        String promptOpening = normalizeWhitespace(systemPrompt).substring(0, ECHO_PREFIX_CHARS);
        if (normalizeWhitespace(proposed).startsWith(promptOpening)) {
            throw new AppException(HttpStatus.BAD_GATEWAY, "The model echoed its instructions instead of "
                    + "writing the note — try again or pick a different model.");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String normalizeWhitespace(String text) {
        return text.replaceAll("\\s+", " ").trim();
    }

    private static String requireNonEmpty(String value) {
        if (value.isEmpty()) {
            throw new AppException(HttpStatus.BAD_GATEWAY,
                    "The model returned nothing — there is nothing to apply.");
        }
        return value;
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
