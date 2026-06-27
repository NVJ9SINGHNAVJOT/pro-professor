package com.proprofessor.server.chat;

import com.proprofessor.server.chat.ChatService.ChatStreamListener;
import com.proprofessor.server.chat.dto.ChatSendRequest;
import com.proprofessor.server.chat.dto.ChatStreamEvent;
import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationListResponse;
import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ClientDisconnectedException;
import com.proprofessor.server.common.web.RequestIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

import java.io.IOException;

/**
 * REST endpoints for chat. Sending a message streams the reply back over SSE;
 * listing, opening, and deleting conversations are plain JSON.
 * Thin — delegates to {@link ChatService} and wraps results in {@link ApiResponse}.
 */
@RestController
@RequestMapping("/api/v1/chats")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    /** Local models can take a while; allow long-running streams before the container times out. */
    private static final long STREAM_TIMEOUT_MS = 10 * 60 * 1000L;

    private final ChatService chatService;
    private final ThreadPoolTaskExecutor chatStreamExecutor;

    public ChatController(ChatService chatService, ThreadPoolTaskExecutor chatStreamExecutor) {
        this.chatService = chatService;
        this.chatStreamExecutor = chatStreamExecutor;
    }

    /**
     * Streams the assistant reply as SSE. Each {@code data:} frame carries a
     * JSON event envelope ({@code chat.start} / {@code chat.chunk} /
     * {@code chat.done} / {@code chat.error}, discriminated by {@code type}).
     */
    @PostMapping(value = "/send", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter send(@RequestBody ChatSendRequest request) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        emitter.onTimeout(() -> log.warn("Chat stream timed out after {} ms", STREAM_TIMEOUT_MS));

        chatStreamExecutor.execute(() -> {
            try {
                InferenceOptions options = new InferenceOptions(
                        request.maxTokens(), request.temperature(), request.topP(),
                        request.repetitionPenalty(), Boolean.TRUE.equals(request.verbose()));
                ChatSendCommand command = new ChatSendCommand(
                        request.conversationId(), request.provider(), request.model(), request.content(),
                        request.attachmentIds() == null ? List.of() : request.attachmentIds(),
                        request.systemPrompt(), options);
                log.info("Chat send: conversationId={} provider={} model={} contentLength={} attachments={}",
                        command.conversationId(), command.provider(), command.model(),
                        command.content() == null ? 0 : command.content().length(),
                        command.attachmentIds().size());
                chatService.streamReply(command, new SseStreamListener(emitter));
            } catch (ClientDisconnectedException ex) {
                log.info("Client disconnected mid-stream; generation aborted");
            } catch (Exception ex) {
                log.error("Chat streaming failed: {}", ex.getMessage(), ex);
                String message = ex instanceof AppException ? ex.getMessage() : "Failed to generate reply";
                try {
                    emitEvent(emitter, ChatStreamEvent.ChatError.of(MDC.get(RequestIdFilter.MDC_KEY), message));
                } catch (ClientDisconnectedException ignored) {
                    // nothing to tell a client that's gone
                }
            }
            completeQuietly(emitter);
        });
        return emitter;
    }

    @GetMapping
    public ApiResponse<ConversationListResponse> list() {
        return ApiResponse.ok(new ConversationListResponse(chatService.listConversations()));
    }

    @GetMapping("/{id}")
    public ApiResponse<ConversationDetail> get(@PathVariable Long id) {
        return ApiResponse.ok(chatService.getConversation(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        chatService.deleteConversation(id);
        return ApiResponse.ok("Conversation deleted.", null);
    }

    private static void emitEvent(SseEmitter emitter, ChatStreamEvent event) {
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
    private static final class SseStreamListener implements ChatStreamListener {

        private final SseEmitter emitter;
        private long conversationId;

        private SseStreamListener(SseEmitter emitter) {
            this.emitter = emitter;
        }

        @Override
        public void onStart(long conversationId, String title) {
            this.conversationId = conversationId;
            emitEvent(emitter, ChatStreamEvent.ChatStart.of(conversationId, title));
        }

        @Override
        public void onTitle(String title) {
            emitEvent(emitter, ChatStreamEvent.ChatTitle.of(conversationId, title));
        }

        @Override
        public void onTranscript(String content) {
            emitEvent(emitter, ChatStreamEvent.ChatTranscript.of(conversationId, content));
        }

        @Override
        public void onToken(String delta) {
            emitEvent(emitter, ChatStreamEvent.ChatChunk.of(conversationId, delta));
        }

        @Override
        public void onThinking(String delta) {
            emitEvent(emitter, ChatStreamEvent.ChatThinking.of(conversationId, delta));
        }

        @Override
        public void onMetrics(Long promptTokens, Long completionTokens, Long totalTokens,
                              Double evalRate, Double totalDurationS) {
            emitEvent(emitter, ChatStreamEvent.ChatMetrics.of(
                    conversationId, promptTokens, completionTokens, totalTokens, evalRate, totalDurationS));
        }

        @Override
        public void onComplete(long messageId) {
            emitEvent(emitter, ChatStreamEvent.ChatDone.of(conversationId, messageId));
        }

        @Override
        public void onError(long messageId, String message) {
            emitEvent(emitter, ChatStreamEvent.ChatError.of(
                    conversationId, messageId, MDC.get(RequestIdFilter.MDC_KEY), message));
        }
    }
}
