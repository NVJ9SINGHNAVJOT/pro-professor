package com.proprofessor.server.chat.mapper;

import com.proprofessor.server.chat.dto.ChatMessageDto;
import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationSummary;
import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.MessageRow;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ChatMapper {

    public ChatMessageDto toMessageDto(MessageRow message) {
        return new ChatMessageDto(
                message.id(),
                message.role(),
                message.content(),
                message.createdAt()
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

    public ConversationDetail toDetail(ConversationRow conversation, List<MessageRow> messages) {
        List<ChatMessageDto> messageDtos = messages.stream()
                .map(this::toMessageDto)
                .toList();
        return new ConversationDetail(
                conversation.id(),
                conversation.title(),
                conversation.model().name(),
                conversation.model().provider(),
                conversation.mode(),
                messageDtos,
                conversation.createdAt(),
                conversation.updatedAt()
        );
    }
}
