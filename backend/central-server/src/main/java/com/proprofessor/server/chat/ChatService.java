package com.proprofessor.server.chat;

import com.proprofessor.server.chat.dto.ConversationDetail;
import com.proprofessor.server.chat.dto.ConversationSummary;
import com.proprofessor.server.chat.mapper.ChatMapper;
import com.proprofessor.server.chat.provider.ChatCompletionClient;
import com.proprofessor.server.chat.provider.dto.ChatMessage;
import com.proprofessor.server.audio.AudioClient;
import com.proprofessor.server.chat.repository.ConversationRepository;
import com.proprofessor.server.chat.repository.MessageRepository;
import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.ConversationSettings;
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
import java.util.function.Consumer;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";
    private static final String ROLE_SYSTEM = "system";
    private static final String ROLE_ERROR = "error";
    private static final String ROLE_SETTINGS = "settings";
    /** Roles that are replayed to the model; {@code error} rows are persisted for the UI only. */
    private static final Set<String> MODEL_ROLES = Set.of(ROLE_USER, ROLE_ASSISTANT, ROLE_SYSTEM);
    /** Clean, user-facing failure text saved to history. Full detail goes to the logs. */
    private static final String GENERATION_ERROR_MESSAGE =
            "The model failed to respond. Please try again or pick another model.";
    private static final String DEFAULT_MODE = "simple";
    private static final int TITLE_MAX_LENGTH = 60;

    /**
     * Sent as a system message on audio turns so the audio-capable model transcribes its own input
     * (preserving its understanding for history) before replying. The backend splits the stream on
     * the {@code <transcript>…</transcript>} delimiter; see {@link AudioTranscriptStream}.
     */
    private static final String AUDIO_TRANSCRIPT_INSTRUCTION = """
            The user's message includes an audio clip of them speaking. Before you reply, \
            transcribe exactly what the user said, wrapped in <transcript> and </transcript> tags. \
            Immediately after the closing </transcript> tag, write your spoken reply to the user. \
            For example: <transcript>what time is it in tokyo</transcript>It's currently 3pm in Tokyo. \
            Always output the <transcript> block first, before anything else.""";

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final MediaRepository mediaRepository;
    private final MediaService mediaService;
    private final ModelService modelService;
    private final ChatCompletionClient chatCompletionClient;
    private final AudioClient audioClient;
    private final ChatMapper chatMapper;

    public ChatService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            MediaRepository mediaRepository,
            MediaService mediaService,
            ModelService modelService,
            ChatCompletionClient chatCompletionClient,
            AudioClient audioClient,
            ChatMapper chatMapper
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.mediaRepository = mediaRepository;
        this.mediaService = mediaService;
        this.modelService = modelService;
        this.chatCompletionClient = chatCompletionClient;
        this.audioClient = audioClient;
        this.chatMapper = chatMapper;
    }

    public void streamReply(ChatSendCommand command, ChatStreamListener listener) {
        ConversationRow conversation = resolveConversation(command);
        ModelRow model = conversation.model();
        ModelProvider provider = ModelProvider.fromValue(model.provider());
        String modelName = model.name();

        listener.onStart(conversation.id(), conversation.title());

        // An existing conversation may carry changed settings; persist them and, when the inference
        // params (not the display toggles) changed, drop a marker before the new turn. A brand-new
        // conversation stored its initial settings at creation, so there's nothing to diff.
        if (command.conversationId() != null) {
            applySettingsChange(conversation, command.options(), listener);
        }

        MessageRow userMessage = messageRepository.insert(conversation.id(), ROLE_USER, command.content());
        linkAttachments(userMessage.id(), command.attachmentIds());

        List<ChatMessage> history = messageRepository.findHistory(conversation.id(), MODEL_ROLES);
        List<MediaRow> audioClips = provider == ModelProvider.AI_SERVICE
                ? audioClips(command.attachmentIds())
                : List.of();
        boolean audioTurn = !audioClips.isEmpty();
        if (audioTurn) {
            history = withTranscriptInstruction(withCurrentTurnAudio(history, audioClips));
        }
        // Images apply to both providers (Ollama vision + ai-service mlx-vlm use the same
        // image_url part) and need none of the audio path's transcript machinery.
        List<MediaRow> images = imageAttachments(command.attachmentIds());
        if (!images.isEmpty()) {
            history = withCurrentTurnImage(history, images);
        }

        try {
            // Pre-warm the model. The AI service reports its own load time in x_metrics; Ollama's
            // OpenAI-compatible chat endpoint omits timing, so on a verbose turn we preload it
            // natively to capture this turn's load_duration and leave a clean prompt-eval timing.
            Double ollamaLoadDurationS = null;
            if (provider == ModelProvider.AI_SERVICE) {
                modelService.loadModel(modelName);
            } else if (provider == ModelProvider.OLLAMA && command.options().verbose()) {
                ollamaLoadDurationS = modelService.preloadOllama(modelName);
            }
            // For an audio turn the model first transcribes the clip inside a delimiter; the splitter
            // strips that from the reply so only the answer reaches the UI/TTS.
            AudioTranscriptStream transcriptStream =
                    audioTurn ? new AudioTranscriptStream(listener::onToken, listener::onTranscript) : null;
            Consumer<String> onToken = audioTurn ? transcriptStream::accept : listener::onToken;

            String raw = chatCompletionClient.streamChat(
                    provider, modelName, history, command.options(), ollamaLoadDurationS,
                    onToken, listener::onThinking,
                    metrics -> listener.onMetrics(
                            metrics.promptTokens(), metrics.completionTokens(), metrics.totalTokens(),
                            metrics.evalRate(), metrics.totalDurationS(), metrics.loadDurationS(),
                            metrics.promptEvalDurationS(), metrics.promptEvalRate(), metrics.evalDurationS()));

            String reply = raw;
            if (audioTurn) {
                reply = transcriptStream.finish(raw);
                String spoken = persistTranscript(
                        userMessage.id(), audioClips, transcriptStream.transcript(), listener);
                titleFromSpokenTurn(conversation, spoken, listener);
            }
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
        ConversationRow conversation = conversationRepository.insert(
                model.id(), deriveTitle(command.content()), DEFAULT_MODE, settingsFrom(command.options()));
        // A persona is the conversation's first (oldest) system row, so it replays to the model on
        // every later turn via findHistory — no per-request plumbing needed.
        String systemPrompt = command.systemPrompt();
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            messageRepository.insert(conversation.id(), ROLE_SYSTEM, systemPrompt.strip());
        }
        return conversation;
    }

    /**
     * Persists the turn's settings onto an existing conversation and, when the inference params
     * changed (the display toggles {@code verbose}/{@code thinking} don't count), inserts a
     * {@code settings} marker before the user message so the UI shows a divider on this turn and
     * on reload.
     */
    private void applySettingsChange(ConversationRow conversation, InferenceOptions options,
                                     ChatStreamListener listener) {
        ConversationSettings stored = conversation.settings();
        String summary = settingsChangeSummary(stored, options);
        boolean paramsChanged = !summary.isEmpty();
        boolean togglesChanged = stored.verbose() != options.verbose()
                || stored.thinkingEnabled() != options.thinkingEnabled();
        if (paramsChanged || togglesChanged) {
            conversationRepository.updateSettings(conversation.id(), settingsFrom(options));
        }
        if (paramsChanged) {
            MessageRow marker =
                    messageRepository.insert(conversation.id(), ROLE_SETTINGS, summary);
            listener.onSettingsChanged(marker.id(), summary);
        }
    }

    private static ConversationSettings settingsFrom(InferenceOptions o) {
        return new ConversationSettings(o.maxTokens(), o.temperature(), o.topP(),
                o.repetitionPenalty(), o.verbose(), o.thinkingEnabled());
    }

    /**
     * Human-readable summary of which sampling params changed, e.g.
     * {@code "Temperature 0.7 → 0.8 · Max tokens 20000 → 1000"}. Stored as the marker's
     * content (shown on reload) and sent live on the {@code chat.settings} event. Empty when
     * nothing changed.
     */
    private static String settingsChangeSummary(ConversationSettings stored, InferenceOptions options) {
        List<String> changes = new ArrayList<>();
        if (!Objects.equals(stored.maxTokens(), options.maxTokens())) {
            changes.add(formatChange("Max tokens", stored.maxTokens(), options.maxTokens()));
        }
        if (!Objects.equals(stored.temperature(), options.temperature())) {
            changes.add(formatChange("Temperature", stored.temperature(), options.temperature()));
        }
        if (!Objects.equals(stored.topP(), options.topP())) {
            changes.add(formatChange("Top P", stored.topP(), options.topP()));
        }
        if (!Objects.equals(stored.repetitionPenalty(), options.repetitionPenalty())) {
            changes.add(formatChange("Repetition penalty", stored.repetitionPenalty(), options.repetitionPenalty()));
        }
        return String.join(" · ", changes);
    }

    private static String formatChange(String label, Object from, Object to) {
        return label + " " + (from == null ? "default" : from) + " → " + (to == null ? "default" : to);
    }

    /** Links already-uploaded media to the just-inserted user message, ignoring unknown ids. */
    private void linkAttachments(long messageId, List<Long> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return;
        }
        mediaRepository.findByIds(attachmentIds)
                .forEach(media -> mediaRepository.linkToMessage(messageId, media.id()));
    }

    /** The audio attachments on this turn, in id order; empty when the turn carries no audio. */
    private List<MediaRow> audioClips(List<Long> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return List.of();
        }
        return mediaRepository.findByIds(attachmentIds).stream()
                .filter(media -> media.mimeType() != null && media.mimeType().startsWith("audio/"))
                .toList();
    }

    /** The image attachments on this turn, in id order; empty when the turn carries no image. */
    private List<MediaRow> imageAttachments(List<Long> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return List.of();
        }
        return mediaRepository.findByIds(attachmentIds).stream()
                .filter(media -> media.mimeType() != null && media.mimeType().startsWith("image/"))
                .toList();
    }

    /**
     * Forwards the current turn's spoken input to an audio-capable model: the last (current) user
     * message in {@code history} is rebuilt to carry each clip as an {@code input_audio} part.
     * Earlier turns stay text-only, matching the AI service's "most recent media only" behavior.
     * Returns the history unchanged when the clips have no readable bytes.
     */
    private List<ChatMessage> withCurrentTurnAudio(List<ChatMessage> history, List<MediaRow> audioClips) {
        if (history.isEmpty()) {
            return history;
        }
        List<ChatMessage.AudioPart> audioParts = audioClips.stream()
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

    /**
     * Forwards the current turn's images to an image-capable model: the last (current) user
     * message in {@code history} is rebuilt to carry each image as an {@code image_url} part
     * (base64 data URL). Earlier turns stay text-only, matching the audio path's "most recent
     * media only" behavior. Preserves any audio parts already on the turn (runs after the audio
     * rewrite). Returns the history unchanged when the images have no readable bytes.
     */
    private List<ChatMessage> withCurrentTurnImage(List<ChatMessage> history, List<MediaRow> images) {
        if (history.isEmpty()) {
            return history;
        }
        List<ChatMessage.ImagePart> imageParts = images.stream()
                .map(this::toImagePart)
                .filter(Objects::nonNull)
                .toList();
        if (imageParts.isEmpty()) {
            return history;
        }
        List<ChatMessage> updated = new ArrayList<>(history);
        int last = updated.size() - 1;
        ChatMessage current = updated.get(last);
        updated.set(last, new ChatMessage(current.role(), current.content(), current.audio(), imageParts));
        return updated;
    }

    /** Loads a stored image's bytes and base64-encodes them into a data URL for an {@code image_url} part. */
    private ChatMessage.ImagePart toImagePart(MediaRow media) {
        byte[] bytes = mediaService.bytes(media);
        if (bytes == null || bytes.length == 0) {
            return null;
        }
        String mimeType = media.mimeType() != null ? media.mimeType() : "image/png";
        String dataUrl = "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(bytes);
        return new ChatMessage.ImagePart(dataUrl);
    }

    /**
     * Adds the transcribe-then-answer directive for an audio turn. When the conversation has a
     * persona (its leading system row), the directive is folded into that one system message —
     * persona first, format directive last — so the model sees a single system message and the
     * persona never competes with (or gets ordered after) the format instruction. With no persona
     * this is the original behavior: prepend the directive as its own system message.
     */
    private List<ChatMessage> withTranscriptInstruction(List<ChatMessage> history) {
        if (!history.isEmpty() && ROLE_SYSTEM.equals(history.get(0).role())) {
            ChatMessage persona = history.get(0);
            List<ChatMessage> updated = new ArrayList<>(history);
            updated.set(0, new ChatMessage(ROLE_SYSTEM,
                    persona.content() + "\n\n" + AUDIO_TRANSCRIPT_INSTRUCTION));
            return updated;
        }
        List<ChatMessage> updated = new ArrayList<>(history.size() + 1);
        updated.add(new ChatMessage(ROLE_SYSTEM, AUDIO_TRANSCRIPT_INSTRUCTION));
        updated.addAll(history);
        return updated;
    }

    /**
     * Backfills the audio turn's user message with the spoken words and returns them. When the model
     * produced its own {@code <transcript>}, it was already streamed to the UI live, so we only
     * persist it here. Otherwise we fall back to a separate STT pass — and emit it now — so a spoken
     * turn is never persisted blank. Returns {@code null} when no words could be recovered.
     */
    private String persistTranscript(long userMessageId, List<MediaRow> audioClips,
                                     String transcript, ChatStreamListener listener) {
        if (transcript != null) {
            messageRepository.updateContent(userMessageId, transcript);
            return transcript;
        }
        String content = transcribeClips(audioClips);
        if (content == null || content.isBlank()) {
            return null;
        }
        messageRepository.updateContent(userMessageId, content);
        listener.onTranscript(content);
        return content;
    }

    /**
     * Titles a conversation that started without one from its first spoken turn — a voice turn
     * carries no typed text, so {@link #resolveConversation} couldn't derive a title at creation.
     * Skips conversations that already have a title (text-started, or an earlier spoken turn).
     */
    private void titleFromSpokenTurn(ConversationRow conversation, String spokenText,
                                     ChatStreamListener listener) {
        if (spokenText == null || spokenText.isBlank()
                || (conversation.title() != null && !conversation.title().isBlank())) {
            return;
        }
        String title = deriveTitle(spokenText);
        conversationRepository.updateTitle(conversation.id(), title);
        listener.onTitle(title);
    }

    /** STT fallback: transcribes the first readable clip when the model skipped the delimiter. */
    private String transcribeClips(List<MediaRow> audioClips) {
        for (MediaRow clip : audioClips) {
            byte[] bytes = mediaService.bytes(clip);
            if (bytes == null || bytes.length == 0) {
                continue;
            }
            try {
                String text = audioClient.transcribe(bytes, clip.originalFilename());
                if (text != null && !text.isBlank()) {
                    return text.strip();
                }
            } catch (RuntimeException ex) {
                log.warn("STT fallback failed for media {}: {}", clip.id(), ex.getMessage());
            }
        }
        return null;
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

        /** A title derived for a conversation that started without one (e.g. a voice turn). */
        void onTitle(String title);

        /** An audio turn's transcribed user words (live-only fill of the user bubble). */
        void onTranscript(String content);

        void onToken(String delta);

        /** The user changed inference params mid-conversation; a {@code settings} marker was persisted. */
        void onSettingsChanged(long messageId, String summary);

        /** One reasoning token (live-only; not persisted). */
        void onThinking(String delta);

        /** Final token/timing metrics, emitted before completion when verbose was requested. */
        void onMetrics(Long promptTokens, Long completionTokens, Long totalTokens,
                       Double evalRate, Double totalDurationS, Double loadDurationS,
                       Double promptEvalDurationS, Double promptEvalRate, Double evalDurationS);

        void onComplete(long messageId);

        /** Generation failed after the conversation existed; an error message was persisted. */
        void onError(long messageId, String message);
    }
}
