package com.proprofessor.server.websocket.events;

/**
 * Events the server sends to the client over WebSocket. Currently only
 * {@code notification.info} — chat streaming uses a separate SSE channel.
 */
public sealed interface OutgoingEvent permits OutgoingEvent.NotificationInfo {

    String type();

    /**
     * {@code notification.info} — a server-pushed notification.
     *
     * @param type        always {@value WsEvents#NOTIFICATION_INFO}
     * @param name        short notification title (e.g. "Model downloaded")
     * @param description longer descriptive text
     */
    record NotificationInfo(String type, String name, String description) implements OutgoingEvent {
        public static NotificationInfo of(String name, String description) {
            return new NotificationInfo(WsEvents.NOTIFICATION_INFO, name, description);
        }
    }
}
