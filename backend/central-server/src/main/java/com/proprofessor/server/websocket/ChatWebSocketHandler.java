package com.proprofessor.server.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;

/**
 * WebSocket endpoint for chat, served at {@code /ws}.
 *
 * <p>Phase-1 scaffold: it logs the connection lifecycle and echoes any text
 * message back to the sender, which is enough to verify the WebSocket transport
 * end to end. Real chat events (saving messages, relaying AI-service streams)
 * will replace the echo logic in a later phase.
 */
@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        log.info("WebSocket connected: sessionId={}", session.getId());
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message)
            throws IOException {
        log.info("WebSocket message: sessionId={}, payload={}", session.getId(), message.getPayload());
        session.sendMessage(new TextMessage("echo: " + message.getPayload()));
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        log.info("WebSocket closed: sessionId={}, status={}", session.getId(), status);
    }
}
