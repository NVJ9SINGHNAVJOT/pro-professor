package com.proprofessor.server.diagram.ai;

import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ClientDisconnectedException;
import com.proprofessor.server.common.exception.ModelBusyException;
import com.proprofessor.server.common.web.LogFormat;
import com.proprofessor.server.common.web.RequestIdFilter;
import com.proprofessor.server.common.web.ResponseLoggingAdvice;
import com.proprofessor.server.diagram.ai.dto.DiagramAiRequest;
import com.proprofessor.server.diagram.ai.dto.DiagramStreamEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
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
 * SSE endpoint for AI diagram edits. Mirrors {@code NotesAiController}'s
 * streaming shape: {@code diagram.start} / {@code diagram.chunk} /
 * {@code diagram.done} / {@code diagram.error} frames on the shared executor.
 */
@RestController
@RequestMapping("/api/v1/diagrams")
public class DiagramAiController {

    private static final Logger log = LoggerFactory.getLogger(DiagramAiController.class);
    /** Local models can take a while; allow long-running streams before the container times out. */
    private static final long STREAM_TIMEOUT_MS = 10 * 60 * 1000L;

    private final DiagramAiService diagramAiService;
    private final ThreadPoolTaskExecutor chatStreamExecutor;
    private final LogFormat logFormat;

    public DiagramAiController(
            DiagramAiService diagramAiService,
            ThreadPoolTaskExecutor chatStreamExecutor, LogFormat logFormat) {
        this.diagramAiService = diagramAiService;
        this.chatStreamExecutor = chatStreamExecutor;
        this.logFormat = logFormat;
    }

    /** Streams the model's command-list reply for an edit; the client validates and applies it. */
    @PostMapping(value = "/{id}/ai-edit", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter aiEdit(@PathVariable Long id, @RequestBody DiagramAiRequest request) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        emitter.onTimeout(() -> log.warn("Diagram AI stream timed out after {} ms", STREAM_TIMEOUT_MS));

        chatStreamExecutor.execute(() -> {
            // Streamed frames never reach ResponseLoggingAdvice; accumulate and log once at the end.
            List<Object> frames = new ArrayList<>();
            try {
                log.info("Diagram AI edit: diagramId={} provider={} model={} instructionLength={} repair={}",
                        id, request.provider(), request.model(),
                        request.instruction() == null ? 0 : request.instruction().length(),
                        request.priorReply() != null);
                diagramAiService.streamDiagramEdit(id, request, new SseDiagramAiListener(emitter, frames));
            } catch (ClientDisconnectedException ex) {
                log.info("Client disconnected mid-stream; diagram AI edit aborted");
            } catch (ModelBusyException ex) {
                log.info("Diagram AI edit rejected: {}", ex.getMessage());
                emitErrorQuietly(emitter, frames, ex.getMessage());
            } catch (Exception ex) {
                log.error("Diagram AI edit failed: {}", ex.getMessage(), ex);
                String message = ex instanceof AppException ? ex.getMessage() : "Failed to edit the diagram";
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
            emitEvent(emitter, frames, DiagramStreamEvent.DiagramError.of(MDC.get(RequestIdFilter.MDC_KEY), message));
        } catch (ClientDisconnectedException ignored) {
            // nothing to tell a client that's gone
        }
    }

    /** Sends a frame to the client and records it so the whole stream can be logged when it ends. */
    private static void emitEvent(SseEmitter emitter, List<Object> frames, DiagramStreamEvent event) {
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
    private static final class SseDiagramAiListener implements DiagramAiService.DiagramAiStreamListener {

        private final SseEmitter emitter;
        private final List<Object> frames;
        private long diagramId;

        private SseDiagramAiListener(SseEmitter emitter, List<Object> frames) {
            this.emitter = emitter;
            this.frames = frames;
        }

        @Override
        public void onStart(long diagramId) {
            this.diagramId = diagramId;
            emitEvent(emitter, frames, DiagramStreamEvent.DiagramStart.of(diagramId));
        }

        @Override
        public void onToken(String delta) {
            emitEvent(emitter, frames, DiagramStreamEvent.DiagramChunk.of(diagramId, delta));
        }

        @Override
        public void onComplete(long diagramId, String raw) {
            emitEvent(emitter, frames, DiagramStreamEvent.DiagramDone.of(diagramId, raw));
        }
    }
}
