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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI note actions: rewrite/summarize/continue a note via a local model
 * (Ollama / AI service through the OpenAI-compatible chat path). The model
 * always returns the complete updated Markdown note; the prior content is
 * snapshotted into {@code note_revisions} before it is overwritten, so every
 * AI edit is reversible.
 */
@Service
public class NotesAiService {

    /** What the model is allowed to assume about the note app's Markdown dialect. */
    private static final String SYSTEM_PROMPT = """
            You are a note-editing assistant inside a Markdown note app. \
            You will be given a note and a task; respond with ONLY the complete updated Markdown note. \
            Do not add explanations before or after it, and do not wrap the whole note in a code fence. \
            Preserve the YAML frontmatter block (--- ... ---) when present, updating it only when the task asks. \
            The app renders GitHub-flavored Markdown, KaTeX math ($...$), Obsidian-style [[wiki-links]] and \
            ![[embeds]], > [!note] callouts, #tags, and ```mermaid diagram fences — use them where helpful.""";

    private static final Pattern WRAPPING_FENCE =
            Pattern.compile("\\A```[a-zA-Z]*\\s*\\n(.*)\\n```\\s*\\z", Pattern.DOTALL);

    /** The three note actions; each builds a different task prompt over the same flow. */
    public enum Action {
        UPDATE, SUMMARIZE, CONTINUE
    }

    /** Streaming callbacks for an AI note action (mirrors {@code ChatStreamListener}). */
    public interface NoteAiStreamListener {
        void onStart(long noteId);

        void onToken(String delta);

        void onComplete(long noteId, long revisionId);
    }

    private final NotesRepository notesRepository;
    private final NotesService notesService;
    private final ChatCompletionClient chatCompletionClient;
    private final ModelActivationService modelActivationService;

    public NotesAiService(
            NotesRepository notesRepository,
            NotesService notesService,
            ChatCompletionClient chatCompletionClient,
            ModelActivationService modelActivationService) {
        this.notesRepository = notesRepository;
        this.notesService = notesService;
        this.chatCompletionClient = chatCompletionClient;
        this.modelActivationService = modelActivationService;
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

        listener.onStart(noteId);
        String reply = streamFromLocalModel(request, userPrompt, listener);

        String updated = stripWrappingFence(reply).trim();
        if (updated.isEmpty()) {
            throw new AppException(HttpStatus.BAD_GATEWAY, "The model returned an empty note — nothing was saved.");
        }
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

    private String streamFromLocalModel(NoteAiRequest request, String userPrompt, NoteAiStreamListener listener) {
        ModelProvider provider = resolveLocalProvider(request.provider());
        if (request.model() == null || request.model().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "A model is required for the local provider.");
        }
        List<ChatMessage> messages = List.of(
                new ChatMessage("system", SYSTEM_PROMPT),
                new ChatMessage("user", userPrompt));
        InferenceOptions options = new InferenceOptions(null, null, null, null, false, false);

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
            case SUMMARIZE -> "Task: add or update a \"## Summary\" section near the top of the note body "
                    + "(after the frontmatter, if any) that concisely summarizes the note. Keep the rest unchanged."
                    + "\n\nCurrent note:\n" + content;
            case CONTINUE -> "Task: continue writing this note from where it ends, matching its style and "
                    + "structure. Return the complete note including your continuation.\n\nCurrent note:\n" + content;
        };
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
