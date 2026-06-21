package com.proprofessor.server.chat;

import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationSummary;
import com.proprofessor.server.chat.mapper.ChatMapper;
import com.proprofessor.server.chat.provider.ChatCompletionClient;
import com.proprofessor.server.chat.provider.dto.ChatMessage;
import com.proprofessor.server.chat.repository.ConversationRepository;
import com.proprofessor.server.chat.repository.MessageRepository;
import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.MediaRow;
import com.proprofessor.server.common.db.MessageRow;
import com.proprofessor.server.common.db.ModelRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ClientDisconnectedException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.media.MediaRepository;
import com.proprofessor.server.media.MediaService;
import com.proprofessor.server.model.ModelService;
import com.proprofessor.server.model.dto.ModelProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";
    private static final String ROLE_SYSTEM = "system";
    private static final String ROLE_ERROR = "error";
    /** Roles that are replayed to the model; {@code error} rows are persisted for the UI only. */
    private static final Set<String> MODEL_ROLES = Set.of(ROLE_USER, ROLE_ASSISTANT, ROLE_SYSTEM);
    /** Clean, user-facing failure text saved to history. Full detail goes to the logs. */
    private static final String GENERATION_ERROR_MESSAGE =
            "The model failed to respond. Please try again or pick another model.";
    private static final String DEFAULT_MODE = "simple";
    private static final int TITLE_MAX_LENGTH = 60;

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final MediaRepository mediaRepository;
    private final MediaService mediaService;
    private final ModelService modelService;
    private final ChatCompletionClient chatCompletionClient;
    private final ChatMapper chatMapper;

    public ChatService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            MediaRepository mediaRepository,
            MediaService mediaService,
            ModelService modelService,
            ChatCompletionClient chatCompletionClient,
            ChatMapper chatMapper
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.mediaRepository = mediaRepository;
        this.mediaService = mediaService;
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

        MessageRow userMessage = messageRepository.insert(conversation.id(), ROLE_USER, command.content());
        linkAttachments(userMessage.id(), command.attachmentIds());

        List<ChatMessage> history = messageRepository.findHistory(conversation.id(), MODEL_ROLES);
        if (provider == ModelProvider.AI_SERVICE) {
            history = withCurrentTurnAudio(history, command.attachmentIds());
        }

        try {
            if (provider == ModelProvider.AI_SERVICE) {
                modelService.loadModel(modelName);
            }
            String reply = chatCompletionClient.streamChat(
                    provider, modelName, history, command.options(),
                    listener::onToken, listener::onThinking,
                    metrics -> listener.onMetrics(
                            metrics.promptTokens(), metrics.completionTokens(), metrics.totalTokens(),
                            metrics.evalRate(), metrics.totalDurationS()));
            MessageRow assistantMessage = messageRepository.insert(conversation.id(), ROLE_ASSISTANT, reply);
            listener.onComplete(assistantMessage.id());
        } catch (ClientDisconnectedException disconnect) {
            // User hit Stop — not a generation failure. Let the controller handle it.
            throw disconnect;
        } catch (Exception ex) {
            log.error("Chat generation failed for conversation {} (provider={}, model={}): {}",
                    conversation.id(), provider.getValue(), modelName, describeFailure(ex), ex);
            MessageRow errorMessage =
                    messageRepository.insert(conversation.id(), ROLE_ERROR, GENERATION_ERROR_MESSAGE);
            listener.onError(errorMessage.id(), GENERATION_ERROR_MESSAGE);
        }
    }

    /** Full failure detail for the logs — includes the upstream HTTP body when present. */
    private static String describeFailure(Throwable ex) {
        if (ex instanceof RestClientResponseException http) {
            return http.getStatusCode() + " " + http.getResponseBodyAsString();
        }
        return ex.getMessage();
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
        Map<Long, List<MediaRow>> attachments = mediaRepository.findByMessageIds(
                messages.stream().map(MessageRow::id).toList());
        return chatMapper.toDetail(conversation, messages, attachments);
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

    /** Links already-uploaded media to the just-inserted user message, ignoring unknown ids. */
    private void linkAttachments(long messageId, List<Long> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return;
        }
        mediaRepository.findByIds(attachmentIds)
                .forEach(media -> mediaRepository.linkToMessage(messageId, media.id()));
    }

    /**
     * Forwards the current turn's spoken input to an audio-capable model: when this turn's
     * attachments include audio, the last (current) user message in {@code history} is rebuilt
     * to carry each clip as an {@code input_audio} part. Earlier turns stay text-only, matching
     * the AI service's "most recent media only" behavior. Returns the history unchanged when
     * there's no audio to forward.
     */
    private List<ChatMessage> withCurrentTurnAudio(List<ChatMessage> history, List<Long> attachmentIds) {
        if (history.isEmpty() || attachmentIds == null || attachmentIds.isEmpty()) {
            return history;
        }
        List<ChatMessage.AudioPart> audioParts = mediaRepository.findByIds(attachmentIds).stream()
                .filter(media -> media.mimeType() != null && media.mimeType().startsWith("audio/"))
                .map(this::toAudioPart)
                .filter(Objects::nonNull)
                .toList();
        if (audioParts.isEmpty()) {
            return history;
        }
        List<ChatMessage> updated = new ArrayList<>(history);
        int last = updated.size() - 1;
        ChatMessage current = updated.get(last);
        updated.set(last, new ChatMessage(current.role(), current.content(), audioParts));
        return updated;
    }

    /** Loads a stored clip's bytes and base64-encodes them for an {@code input_audio} part. */
    private ChatMessage.AudioPart toAudioPart(MediaRow media) {
        byte[] bytes = mediaService.bytes(media);
        if (bytes == null || bytes.length == 0) {
            return null;
        }
        return new ChatMessage.AudioPart(
                Base64.getEncoder().encodeToString(bytes),
                audioFormat(media.mimeType()));
    }

    /** Maps an audio MIME type to the format hint the model decodes by (defaults to {@code wav}). */
    private static String audioFormat(String mimeType) {
        if (mimeType == null) {
            return "wav";
        }
        String subtype = mimeType.substring(mimeType.indexOf('/') + 1).toLowerCase(Locale.ROOT);
        return switch (subtype) {
            case "wave", "x-wav", "vnd.wave", "wav" -> "wav";
            case "mpeg", "mp3" -> "mp3";
            default -> subtype.isBlank() ? "wav" : subtype;
        };
    }

    private static String deriveTitle(String content) {
        String trimmed = content.strip();
        return trimmed.length() <= TITLE_MAX_LENGTH ? trimmed : trimmed.substring(0, TITLE_MAX_LENGTH);
    }

    public interface ChatStreamListener {
        void onStart(long conversationId, String title);

        void onToken(String delta);

        /** One reasoning token (live-only; not persisted). */
        void onThinking(String delta);

        /** Final token/timing metrics, emitted before completion when verbose was requested. */
        void onMetrics(Long promptTokens, Long completionTokens, Long totalTokens,
                       Double evalRate, Double totalDurationS);

        void onComplete(long messageId);

        /** Generation failed after the conversation existed; an error message was persisted. */
        void onError(long messageId, String message);
    }
}
