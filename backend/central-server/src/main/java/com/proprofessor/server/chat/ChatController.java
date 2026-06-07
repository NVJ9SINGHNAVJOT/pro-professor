package com.proprofessor.server.chat;

import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationListResponse;
import com.proprofessor.server.common.dto.ApiResponse;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for conversation history. Sending messages happens over WebSocket;
 * these cover listing, opening, and deleting conversations. Thin — delegates to
 * {@link ChatService} and wraps results in {@link ApiResponse}.
 */
@RestController
@RequestMapping("/api/v1/chats")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
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
}
