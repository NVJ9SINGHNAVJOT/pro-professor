package com.proprofessor.server.chat;

import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationSummary;
import com.proprofessor.server.chat.mapper.ChatMapper;
import com.proprofessor.server.chat.provider.ChatCompletionClient;
import com.proprofessor.server.chat.provider.dto.ChatCompletionRequest;
import com.proprofessor.server.chat.repository.ConversationRepository;
import com.proprofessor.server.chat.repository.MessageRepository;
import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.MessageRow;
import com.proprofessor.server.common.db.ModelRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.model.ModelService;
import com.proprofessor.server.model.dto.ModelProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ChatService {

    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";
    private static final String DEFAULT_MODE = "simple";
    private static final int TITLE_MAX_LENGTH = 60;

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ModelService modelService;
    private final ChatCompletionClient chatCompletionClient;
    private final ChatMapper chatMapper;

    public ChatService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            ModelService modelService,
            ChatCompletionClient chatCompletionClient,
            ChatMapper chatMapper
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.modelService = modelService;
        this.chatCompletionClient = chatCompletionClient;
        this.chatMapper = chatMapper;
    }

    public void streamReply(ChatSendCommand command, ChatStreamListener listener) {
        ConversationRow conversation = resolveConversation(command);
        ModelRow model = conversation.model();
        ModelProvider provider = ModelProvider.fromValue(model.provider());
        String modelName = model.name();

        listener.onStart(conversation.id(), conversation.title());

        messageRepository.insert(conversation.id(), ROLE_USER, command.content());

        List<ChatCompletionRequest.Message> history = buildHistory(conversation.id());

        if (provider == ModelProvider.AI_SERVICE) {
            modelService.loadModel(modelName);
        }

        String reply = chatCompletionClient.streamChat(provider, modelName, history, listener::onToken);

        MessageRow assistantMessage = messageRepository.insert(conversation.id(), ROLE_ASSISTANT, reply);
        listener.onComplete(assistantMessage.id());
    }

    public List<ConversationSummary> listConversations() {
        return conversationRepository.findAll().stream()
                .map(chatMapper::toSummary)
                .toList();
    }

    public ConversationDetail getConversation(Long id) {
        ConversationRow conversation = conversationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Conversation not found: " + id));
        List<MessageRow> messages = messageRepository.findAllByConversationId(id);
        return chatMapper.toDetail(conversation, messages);
    }

    public void deleteConversation(Long id) {
        if (!conversationRepository.existsById(id)) {
            throw new ResourceNotFoundException("Conversation not found: " + id);
        }
        conversationRepository.deleteById(id);
    }

    private ConversationRow resolveConversation(ChatSendCommand command) {
        if (command.conversationId() != null) {
            return conversationRepository.findById(command.conversationId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Conversation not found: " + command.conversationId()));
        }
        if (command.provider() == null || command.model() == null || command.model().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST,
                    "provider and model are required to start a conversation");
        }
        ModelRow model = modelService.getOrCreateModel(command.provider(), command.model());
        return conversationRepository.insert(model.id(), deriveTitle(command.content()), DEFAULT_MODE);
    }

    private List<ChatCompletionRequest.Message> buildHistory(long conversationId) {
        return messageRepository.findAllByConversationId(conversationId).stream()
                .map(msg -> new ChatCompletionRequest.Message(msg.role(), msg.content()))
                .toList();
    }

    private static String deriveTitle(String content) {
        String trimmed = content.strip();
        return trimmed.length() <= TITLE_MAX_LENGTH ? trimmed : trimmed.substring(0, TITLE_MAX_LENGTH);
    }

    public interface ChatStreamListener {
        void onStart(long conversationId, String title);

        void onToken(String delta);

        void onComplete(long messageId);
    }
}
