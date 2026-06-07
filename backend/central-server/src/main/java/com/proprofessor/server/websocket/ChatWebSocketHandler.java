package com.proprofessor.server.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.chat.ChatSendCommand;
import com.proprofessor.server.chat.ChatService;
import com.proprofessor.server.chat.ChatService.ChatStreamListener;
import com.proprofessor.server.websocket.events.IncomingEvent;
import com.proprofessor.server.websocket.events.IncomingEvent.ChatSendEvent;
import com.proprofessor.server.websocket.events.OutgoingEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket endpoint for chat at {@code /ws}.
 *
 * <p>Deserializes a typed {@link IncomingEvent}, offloads the (slow) streaming work
 * to {@code chatStreamExecutor} so the receive thread isn't blocked, and relays typed
 * {@link OutgoingEvent}s back. Sessions are wrapped in
 * {@link ConcurrentWebSocketSessionDecorator} because tokens are sent from a pool
 * thread and WebSocket sessions are not safe for concurrent sends.
 */
@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);
    private static final int SEND_TIME_LIMIT_MS = 10_000;
    private static final int SEND_BUFFER_LIMIT_BYTES = 512 * 1024;

    private final ChatService chatService;
    private final ObjectMapper objectMapper;
    private final ThreadPoolTaskExecutor chatStreamExecutor;
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public ChatWebSocketHandler(ChatService chatService, ObjectMapper objectMapper,
                                ThreadPoolTaskExecutor chatStreamExecutor) {
        this.chatService = chatService;
        this.objectMapper = objectMapper;
        this.chatStreamExecutor = chatStreamExecutor;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        sessions.put(session.getId(),
                new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT_BYTES));
        log.info("WebSocket connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
        IncomingEvent event;
        try {
            event = objectMapper.readValue(message.getPayload(), IncomingEvent.class);
        } catch (Exception ex) {
            log.warn("Invalid WS message from {}: {}", session.getId(), ex.getMessage());
            sendEvent(session.getId(), OutgoingEvent.ChatError.of("Invalid message"));
            return;
        }

        switch (event) {
            case ChatSendEvent sendEvent -> handleSend(session.getId(), sendEvent);
        }
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        sessions.remove(session.getId());
        log.info("WebSocket closed: {} ({})", session.getId(), status);
    }

    private void handleSend(String sessionId, ChatSendEvent event) {
        chatStreamExecutor.execute(() -> {
            try {
                ChatSendCommand command = new ChatSendCommand(
                        event.conversationId(), event.provider(), event.model(), event.content());
                chatService.streamReply(command, new WsStreamListener(sessionId));
            } catch (Exception ex) {
                log.error("Chat streaming failed for {}: {}", sessionId, ex.getMessage());
                sendEvent(sessionId, OutgoingEvent.ChatError.of("Failed to generate reply"));
            }
        });
    }

    private void sendEvent(String sessionId, OutgoingEvent event) {
        WebSocketSession session = sessions.get(sessionId);
        if (session == null || !session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(event)));
        } catch (IOException ex) {
            log.warn("Failed to send WS event to {}: {}", sessionId, ex.getMessage());
        }
    }

    /** Pushes streaming progress back to one client session as typed events. */
    private final class WsStreamListener implements ChatStreamListener {

        private final String sessionId;
        private long conversationId;

        private WsStreamListener(String sessionId) {
            this.sessionId = sessionId;
        }

        @Override
        public void onStart(long conversationId, String title) {
            this.conversationId = conversationId;
            sendEvent(sessionId, OutgoingEvent.ChatStart.of(conversationId, title));
        }

        @Override
        public void onToken(String delta) {
            sendEvent(sessionId, OutgoingEvent.ChatChunk.of(conversationId, delta));
        }

        @Override
        public void onComplete(long messageId) {
            sendEvent(sessionId, OutgoingEvent.ChatDone.of(conversationId, messageId));
        }
    }
}
