package com.proprofessor.server.notes.ai;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ClientDisconnectedException;
import com.proprofessor.server.common.exception.ModelBusyException;
import com.proprofessor.server.common.web.LogFormat;
import com.proprofessor.server.common.web.RequestIdFilter;
import com.proprofessor.server.common.web.ResponseLoggingAdvice;
import com.proprofessor.server.notes.ai.dto.NoteAiRequest;
import com.proprofessor.server.notes.ai.dto.NoteStreamEvent;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteRevisionListResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * SSE endpoints for AI note actions plus the revision history. Mirrors
 * {@code ChatController}'s streaming shape: the reply streams as
 * {@code note.start} / {@code note.chunk} / {@code note.done} / {@code note.error}
 * frames on the shared chat stream executor.
 */
@RestController
@RequestMapping("/api/v1/notes")
public class NotesAiController {

    private static final Logger log = LoggerFactory.getLogger(NotesAiController.class);
    /** Local models can take a while; allow long-running streams before the container times out. */
    private static final long STREAM_TIMEOUT_MS = 10 * 60 * 1000L;

    private final NotesAiService notesAiService;
    private final ThreadPoolTaskExecutor chatStreamExecutor;
    private final LogFormat logFormat;

    public NotesAiController(
            NotesAiService notesAiService,
            ThreadPoolTaskExecutor chatStreamExecutor, LogFormat logFormat) {
        this.notesAiService = notesAiService;
        this.chatStreamExecutor = chatStreamExecutor;
        this.logFormat = logFormat;
    }

    /** Rewrites the note per the request's instruction, streaming the new content. */
    @PostMapping(value = "/{id}/ai-update", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter aiUpdate(@PathVariable Long id, @RequestBody NoteAiRequest request) {
        return stream(id, NotesAiService.Action.UPDATE, request);
    }

    /** Adds/refreshes a summary section, streaming the new content. */
    @PostMapping(value = "/{id}/summarize", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter summarize(@PathVariable Long id, @RequestBody NoteAiRequest request) {
        return stream(id, NotesAiService.Action.SUMMARIZE, request);
    }

    /** Continues writing from the end of the note, streaming the new content. */
    @PostMapping(value = "/{id}/continue", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter continueWriting(@PathVariable Long id, @RequestBody NoteAiRequest request) {
        return stream(id, NotesAiService.Action.CONTINUE, request);
    }

    @GetMapping("/{id}/revisions")
    public ApiResponse<NoteRevisionListResponse> revisions(@PathVariable Long id) {
        return ApiResponse.ok(new NoteRevisionListResponse(notesAiService.listRevisions(id)));
    }

    @PostMapping("/{id}/revisions/{revisionId}/restore")
    public ApiResponse<NoteDetail> restore(@PathVariable Long id, @PathVariable Long revisionId) {
        return ApiResponse.ok("Revision restored.", notesAiService.restoreRevision(id, revisionId));
    }

    private SseEmitter stream(long noteId, NotesAiService.Action action, NoteAiRequest request) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        emitter.onTimeout(() -> log.warn("Note AI stream timed out after {} ms", STREAM_TIMEOUT_MS));

        chatStreamExecutor.execute(() -> {
            // Streamed frames never reach ResponseLoggingAdvice; accumulate and log once at the end.
            List<Object> frames = new ArrayList<>();
            try {
                log.info("Note AI {}: noteId={} provider={} model={} instructionLength={}",
                        action, noteId, request.provider(), request.model(),
                        request.instruction() == null ? 0 : request.instruction().length());
                notesAiService.streamNoteAction(noteId, action, request, new SseNoteAiListener(emitter, frames));
            } catch (ClientDisconnectedException ex) {
                log.info("Client disconnected mid-stream; note AI action aborted");
            } catch (ModelBusyException ex) {
                log.info("Note AI action rejected: {}", ex.getMessage());
                emitErrorQuietly(emitter, frames, ex.getMessage());
            } catch (Exception ex) {
                log.error("Note AI action failed: {}", ex.getMessage(), ex);
                String message = ex instanceof AppException ? ex.getMessage() : "Failed to update the note";
                emitErrorQuietly(emitter, frames, message);
            } finally {
                log.info("Response sent\n{}", logFormat.dumps(ResponseLoggingAdvice.envelope(200, frames)));
            }
            completeQuietly(emitter);
        });
        return emitter;
    }

    private static void emitErrorQuietly(SseEmitter emitter, List<Object> frames, String message) {
        try {
            emitEvent(emitter, frames, NoteStreamEvent.NoteError.of(MDC.get(RequestIdFilter.MDC_KEY), message));
        } catch (ClientDisconnectedException ignored) {
            // nothing to tell a client that's gone
        }
    }

    /** Sends a frame to the client and records it so the whole stream can be logged when it ends. */
    private static void emitEvent(SseEmitter emitter, List<Object> frames, NoteStreamEvent event) {
        frames.add(event);
        try {
            emitter.send(SseEmitter.event().data(event, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException ex) {
            // client went away mid-stream — abort generation by propagating
            throw new ClientDisconnectedException(ex);
        }
    }

    private static void completeQuietly(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (IllegalStateException ignored) {
            // already completed/errored by the container
        }
    }

    /** Pushes streaming progress to the client as SSE events. */
    private static final class SseNoteAiListener implements NotesAiService.NoteAiStreamListener {

        private final SseEmitter emitter;
        private final List<Object> frames;
        private long noteId;

        private SseNoteAiListener(SseEmitter emitter, List<Object> frames) {
            this.emitter = emitter;
            this.frames = frames;
        }

        @Override
        public void onStart(long noteId) {
            this.noteId = noteId;
            emitEvent(emitter, frames, NoteStreamEvent.NoteStart.of(noteId));
        }

        @Override
        public void onToken(String delta) {
            emitEvent(emitter, frames, NoteStreamEvent.NoteChunk.of(noteId, delta));
        }

        @Override
        public void onComplete(long noteId, long revisionId) {
            emitEvent(emitter, frames, NoteStreamEvent.NoteDone.of(noteId, revisionId));
        }
    }
}
