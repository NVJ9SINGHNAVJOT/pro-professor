package com.proprofessor.server.chat.mapper;

import com.proprofessor.server.chat.dto.ChatMessageDto;
import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationSummary;
import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.common.db.MessageRow;
import com.proprofessor.server.media.MediaService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class ChatMapper {

    private final MediaService mediaService;

    public ChatMapper(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    public ChatMessageDto toMessageDto(MessageRow message, List<MediaRow> attachments) {
        return new ChatMessageDto(
                message.id(),
                message.role(),
                message.content(),
                message.createdAt(),
                attachments.stream().map(mediaService::toResponse).toList()
        );
    }

    public ConversationSummary toSummary(ConversationRow conversation) {
        return new ConversationSummary(
                conversation.id(),
                conversation.title(),
                conversation.model().name(),
                conversation.model().provider(),
                conversation.updatedAt()
        );
    }

    public ConversationDetail toDetail(
            ConversationRow conversation,
            List<MessageRow> messages,
            Map<Long, List<MediaRow>> attachmentsByMessageId) {
        List<ChatMessageDto> messageDtos = messages.stream()
                .map(message -> toMessageDto(
                        message,
                        attachmentsByMessageId.getOrDefault(message.id(), List.of())))
                .toList();
        return new ConversationDetail(
                conversation.id(),
                conversation.title(),
                conversation.model().name(),
                conversation.model().provider(),
                conversation.mode(),
                messageDtos,
                conversation.settings().maxTokens(),
                conversation.settings().temperature(),
                conversation.settings().topP(),
                conversation.settings().repetitionPenalty(),
                conversation.settings().verbose(),
                conversation.settings().thinkingEnabled(),
                conversation.lastContextTokens(),
                conversation.createdAt(),
                conversation.updatedAt()
        );
    }
}
