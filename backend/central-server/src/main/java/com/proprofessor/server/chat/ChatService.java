package com.proprofessor.server.chat;

import com.proprofessor.server.chat.dto.ChatSearchResult;
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
import com.proprofessor.server.common.db.VoiceSettings;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ClientDisconnectedException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.media.MediaRepository;
import com.proprofessor.server.media.MediaService;
import com.proprofessor.server.model.ModelActivationService;
import com.proprofessor.server.model.ModelService;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.settings.SettingsService;
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
     * The cap on a hand-typed rename — the {@code conversations.title} column width, rather than
     * the 60 chars a derived title is cut to. A title the user chose is not a snippet of something
     * longer, so the only limit that has to hold is the column's.
     */
    private static final int TITLE_COLUMN_LENGTH = 255;

    /**
     * Stands in for the note body on a brand-new note. Said out loud rather than sent as emptiness,
     * so the model reaches for {@code <append>} or {@code <rewrite>} instead of trying to quote text
     * that isn't there yet.
     */
    private static final String EMPTY_NOTE_BODY = "(The note is currently empty — there is nothing to quote yet.)";

    /** Frames the note for the model, so it doesn't read as part of the user's question. */
    private static final String NOTE_CONTEXT_PREAMBLE =
            "The user is asking about the Markdown note below. Answer from it. Do not rewrite or "
                    + "restate the whole note unless asked.\n\n";

    /** What the model is allowed to assume about the note app's Markdown dialect. */
    private static final String MARKDOWN_DIALECT = """
            The app renders GitHub-flavored Markdown, KaTeX math ($...$), Obsidian-style [[wiki-links]] and \
            ![[embeds]], > [!note] callouts, #tags, and ```mermaid diagram fences — use them where helpful. \
            Images come in two forms: ![[file.png]] embeds a file already uploaded to the app, and \
            ![alt](https://...) embeds one by URL. Only reference images that already appear in the note or \
            that the task gives you — never invent a filename or a URL.""";

    /**
     * Mermaid's own syntax, not house style — kept apart from {@link #MERMAID_NUMBERING} because
     * that constant is the numbering convention, which {@code skills/pro-professor-notes/SKILL.md}
     * owns and must be kept in step with. A bare bracket in a label is a hard parse error (the
     * lexer reads "(" as the start of a round node even inside an edge label), so the diagram
     * renders as an error box rather than looking merely off-style.
     */
    private static final String MERMAID_SYNTAX = """
            In a mermaid diagram, wrap label text in double quotes whenever it contains a bracket, \
            brace, parenthesis, # or quote. This applies to NODE labels and EDGE labels alike:

            B["Validate input (required fields)"]   correct
            B[Validate input (required fields)]     BREAKS THE DIAGRAM
            A -->|"retry (up to 3 times)"| C        correct
            A -->|retry (up to 3 times)| C          BREAKS THE DIAGRAM

            Mermaid reads a bare ( as the start of a round node even in the middle of a label, so one \
            unquoted bracket anywhere fails the whole diagram — not just that line. When in doubt, quote \
            the label.""";

    /** House style for flow diagrams; the full table lives in {@code skills/pro-professor-notes/SKILL.md}. */
    private static final String MERMAID_NUMBERING = """
            When a mermaid diagram shows a flow, label its edges with step numbers: 1, 2, 3 in order; \
            2a/2b for branches where only one is taken; 4.1/4.2 where every branch is taken; the same \
            number repeated on both edges where branches rejoin. Leave structural edges (an import, \
            "depends on") unlabelled, and leave sequence and state diagrams unnumbered.""";

    /**
     * The note-editing contract, for a turn from the notes panel.
     *
     * <p>Delimited blocks rather than JSON or tool calls: the AI core rejects {@code tools} and any
     * {@code response_format} other than text, and multi-line Markdown inside JSON string escapes is
     * where small local models come apart. Tags rather than Aider's {@code <<<<<<< SEARCH} markers
     * because {@code =======} and {@code -------} are setext heading underlines in Markdown. The
     * frontend parses the blocks out of the reply and shows each as a diff the user accepts or
     * rejects — nothing here reaches the note on its own.
     */
    private static final String NOTE_EDIT_PROTOCOL =
            """
            You are helping the user with one Markdown note, given at the end of this message.

            Answer their question directly, in prose. When what they want is a change to the note, \
            propose it as edit blocks instead, and keep the prose to a sentence saying what you changed.

            To change part of the note, quote the text you are replacing and give its replacement. \
            Suppose the note contained this line:

            The cat sat on the mat, waiting.

            To fix the word "mat" you would write exactly this, and nothing else:

            <edit>
            <find>
            The cat sat on the mat, waiting.
            </find>
            <replace>
            The cat sat on the rug, waiting.
            </replace>
            </edit>

            That example is only to show the shape of a block. Never copy its words — what goes inside \
            <find> is always text taken from the real note below.

            To add to the end of the note:

            <append>
            ## Sources

            Written up from the team meeting.
            </append>

            To replace the entire note, only when that is what was asked:

            <rewrite>
            # The complete new note

            ...every line of it...
            </rewrite>

            Rules. Copy <find> from the note character for character, including indentation, and quote \
            enough lines around it that it appears exactly once — never shorten it with "...". Use one \
            block per change; several small edits beat one big one. Put nothing inside the tags but the \
            text itself. Do not restate the note outside a block, and do not wrap a block in a code fence. \
            If nothing needs to change, just answer.

            """
                    + MARKDOWN_DIALECT
                    + "\n\n"
                    + MERMAID_SYNTAX
                    + "\n\n"
                    + MERMAID_NUMBERING
                    + "\n\nEverything after the NOTE: line is the note's current content.\n\nNOTE:\n";

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
    private final ModelActivationService modelActivationService;
    private final ChatCompletionClient chatCompletionClient;
    private final AudioClient audioClient;
    private final ChatMapper chatMapper;
    private final SettingsService settingsService;

    public ChatService(
            ConversationRepository conversationRepository,
            MessageRepository messageRepository,
            MediaRepository mediaRepository,
            MediaService mediaService,
            ModelService modelService,
            ModelActivationService modelActivationService,
            ChatCompletionClient chatCompletionClient,
            AudioClient audioClient,
            ChatMapper chatMapper,
            SettingsService settingsService
    ) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.mediaRepository = mediaRepository;
        this.mediaService = mediaService;
        this.modelService = modelService;
        this.modelActivationService = modelActivationService;
        this.chatCompletionClient = chatCompletionClient;
        this.audioClient = audioClient;
        this.chatMapper = chatMapper;
        this.settingsService = settingsService;
    }

    public void streamReply(ChatSendCommand rawCommand, ChatStreamListener listener) {
        // Resolved once, here, rather than at conversation creation: generate() also diffs these
        // against the stored settings on every later turn, so filling them later would make each
        // turn of a params-omitting client look like a settings change.
        ChatSendCommand command = rawCommand
                .withOptions(withDefaults(rawCommand.options()))
                .withVoice(withVoiceDefaults(rawCommand.voice()));
        // Resolve the target model up front (read-only) so the global single-model lock can be
        // enforced before anything is persisted: a rejected turn (a different model is mid-generation)
        // throws out of acquireForChat and leaves no conversation/message rows behind.
        ConversationRow existing =
                command.conversationId() == null ? null : loadConversation(command.conversationId());
        ModelProvider provider = existing != null
                ? ModelProvider.fromValue(existing.model().provider())
                : requireProvider(command);
        String modelName = existing != null ? existing.model().name() : command.model();

        modelActivationService.acquireForChat(provider, modelName);
        try {
            ConversationRow conversation = existing != null ? existing : createConversation(command);
            generate(command, conversation, listener);
        } finally {
            modelActivationService.releaseAfterChat();
        }
    }

    /**
     * Runs the turn against the already-activated model: persists the user message, replays history,
     * and streams the assistant reply. The model is guaranteed loaded (and the only one resident) by
     * {@link ModelActivationService#acquireForChat}, which ran before this was called.
     */
    private void generate(ChatSendCommand command, ConversationRow conversation, ChatStreamListener listener) {
        ModelRow model = conversation.model();
        ModelProvider provider = ModelProvider.fromValue(model.provider());
        String modelName = model.name();

        listener.onStart(conversation.id(), conversation.title());

        // An existing conversation may carry changed settings; persist them and, when the inference
        // params (not the display toggles) changed, drop a marker before the new turn. A brand-new
        // conversation stored its initial settings at creation, so there's nothing to diff.
        if (command.conversationId() != null) {
            applySettingsChange(conversation, command.options(), listener);
            applyVoiceChange(conversation, command.voice().toSettings());
        }

        MessageRow userMessage = messageRepository.insert(conversation.id(), ROLE_USER, command.content());
        linkAttachments(userMessage.id(), command.attachmentIds());
        // Messages live in their own table, so persisting one leaves the conversation row (and its
        // updated_at) untouched. Bump it here, before the reply is generated, so the history list
        // sorts this chat to the top whether the turn finishes, fails, or is stopped.
        conversationRepository.touch(conversation.id());

        List<ChatMessage> history = messageRepository.findHistory(conversation.id(), MODEL_ROLES);
        List<MediaRow> audioClips = provider == ModelProvider.AI_CORE
                ? audioClips(command.attachmentIds())
                : List.of();
        boolean audioTurn = !audioClips.isEmpty();
        if (audioTurn) {
            history = withTranscriptInstruction(withCurrentTurnAudio(history, audioClips));
        }
        // Images apply to both providers (Ollama vision + ai-core mlx-vlm use the same
        // image_url part) and need none of the audio path's transcript machinery.
        List<MediaRow> images = imageAttachments(command.attachmentIds());
        if (!images.isEmpty()) {
            history = withCurrentTurnImage(history, images);
        }
        // The note the turn is about, refreshed by the client on every send. Injected here rather
        // than persisted as the conversation's persona: a persona is written once on the first turn
        // (see createConversation), so it would answer about the note as it was then, silently.
        history = withNoteContext(history, command.noteContext(), command.noteChat());
        // The app renders ```mermaid fences everywhere, so the syntax rule has to reach everywhere a
        // model might write one. The note-edit protocol already carries it; every other turn — the
        // main chat, and a notes turn sent with context "None" — got nothing at all until now, which
        // is why diagrams asked for in plain chat came back with unquoted brackets and failed to
        // render. Numbering stays note-only: that is house style, this is correctness.
        if (!carriesNoteProtocol(command.noteContext(), command.noteChat())) {
            history = insertSystemBeforeTurn(history, MERMAID_SYNTAX);
        }

        try {
            // The AI core reports its own timing (including load) in x_metrics. Ollama's
            // OpenAI-compatible endpoint omits timing; we synthesize it from wall-clock. The model was
            // already loaded (and the other engine freed) by acquireForChat, so we don't preload here —
            // a native Ollama preload warms its KV cache, which deflates the prompt token count the
            // context meter relies on (and Ollama's load_duration is unavailable here).
            // For an audio turn the model first transcribes the clip inside a delimiter; the splitter
            // strips that from the reply so only the answer reaches the UI/TTS.
            AudioTranscriptStream transcriptStream =
                    audioTurn ? new AudioTranscriptStream(listener::onToken, listener::onTranscript) : null;
            Consumer<String> onToken = audioTurn ? transcriptStream::accept : listener::onToken;

            // Token counts arrive every turn (for the context meter); the verbose timing block is
            // forwarded for display only when the user asked for it. The meter tracks prompt tokens
            // — the context actually fed to the model (excludes the reply and any stripped reasoning).
            boolean verbose = command.options().verbose();
            Long[] contextTokens = {null};
            String raw = chatCompletionClient.streamChat(
                    provider, modelName, history, command.options(),
                    onToken, listener::onThinking,
                    metrics -> {
                        if (metrics.promptTokens() != null) {
                            contextTokens[0] = metrics.promptTokens();
                        }
                        if (verbose) {
                            listener.onMetrics(
                                    metrics.promptTokens(), metrics.completionTokens(), metrics.totalTokens(),
                                    metrics.evalRate(), metrics.totalDurationS(), metrics.loadDurationS(),
                                    metrics.promptEvalDurationS(), metrics.promptEvalRate(), metrics.evalDurationS());
                        }
                    });

            String reply = raw;
            if (audioTurn) {
                reply = transcriptStream.finish(raw);
                String spoken = persistTranscript(
                        userMessage.id(), audioClips, transcriptStream.transcript(),
                        command.voice().sttModel(), listener);
                titleFromSpokenTurn(conversation, spoken, listener);
            }
            MessageRow assistantMessage = messageRepository.insert(conversation.id(), ROLE_ASSISTANT, reply);
            // Persist the conversation's current context usage so the meter is correct on reload.
            if (contextTokens[0] != null) {
                conversationRepository.updateLastContextTokens(conversation.id(), contextTokens[0].intValue());
            }
            listener.onComplete(assistantMessage.id(), contextTokens[0]);
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

    /**
     * Full-text search over chat messages for the ⌘K palette. A blank query is a no-op rather than
     * a match-everything — the palette calls this on every keystroke.
     */
    public List<ChatSearchResult> searchConversations(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return conversationRepository.search(query.trim());
    }

    public ConversationDetail getConversation(Long id) {
        ConversationRow conversation = conversationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Conversation not found: " + id));
        List<MessageRow> messages = messageRepository.findAllByConversationId(id);
        Map<Long, List<MediaRow>> attachments = mediaRepository.findByMessageIds(
                messages.stream().map(MessageRow::id).toList());
        return chatMapper.toDetail(conversation, messages, attachments);
    }

    /**
     * Renames a conversation from the sidebar — the one title a user sets by hand, as opposed to
     * the ones {@link #deriveTitle} takes from a first message or a first spoken turn.
     */
    public ConversationSummary renameConversation(Long id, String title) {
        ConversationRow conversation = loadConversation(id);
        if (title == null || title.isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        String trimmed = title.trim();
        // A longer title is a paste, not a mistake worth refusing — cut it rather than 400.
        String resolved = trimmed.length() > TITLE_COLUMN_LENGTH
                ? trimmed.substring(0, TITLE_COLUMN_LENGTH)
                : trimmed;
        conversationRepository.updateTitle(conversation.id(), resolved);
        return chatMapper.toSummary(loadConversation(id));
    }

    public void deleteConversation(Long id) {
        if (!conversationRepository.existsById(id)) {
            throw new ResourceNotFoundException("Conversation not found: " + id);
        }
        conversationRepository.deleteById(id);
    }

    /** Loads an existing conversation or fails with 404 — never creates. */
    private ConversationRow loadConversation(long conversationId) {
        return conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Conversation not found: " + conversationId));
    }

    /** Validates that a new conversation names a model, returning its provider. */
    private ModelProvider requireProvider(ChatSendCommand command) {
        if (command.provider() == null || command.model() == null || command.model().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST,
                    "provider and model are required to start a conversation");
        }
        return command.provider();
    }

    /**
     * Fills unset sampling params from the stored Notes defaults, so a client may omit them
     * entirely — the note chat panel does, since those sliders are the user-facing setting for it.
     * Needed either way: the four columns are NOT NULL, so a null would fail the insert.
     *
     * <p>The main chat always sends concrete params, so it returns early and never queries.
     */
    private InferenceOptions withDefaults(InferenceOptions options) {
        if (options.maxTokens() != null && options.temperature() != null
                && options.topP() != null && options.repetitionPenalty() != null) {
            return options;
        }
        InferenceOptions defaults = settingsService.notesInferenceOptions();
        return new InferenceOptions(
                options.maxTokens() != null ? options.maxTokens() : defaults.maxTokens(),
                options.temperature() != null ? options.temperature() : defaults.temperature(),
                options.topP() != null ? options.topP() : defaults.topP(),
                options.repetitionPenalty() != null
                        ? options.repetitionPenalty() : defaults.repetitionPenalty(),
                options.verbose(), options.thinkingEnabled());
    }

    /**
     * Fills unset voice settings from the stored defaults, so a client may omit them entirely — the
     * note chat panel does, having no voice controls of its own. Needed either way: the five
     * columns are NOT NULL.
     *
     * <p>The chat screen always sends concrete values, so it returns early and never queries.
     */
    private VoiceOptions withVoiceDefaults(VoiceOptions voice) {
        if (voice.sttModel() != null && voice.preferModelAudio() != null && voice.ttsVoice() != null
                && voice.ttsLangCode() != null && voice.ttsSpeed() != null) {
            return voice;
        }
        VoiceSettings defaults = settingsService.voiceDefaults();
        return new VoiceOptions(
                voice.sttModel() != null ? voice.sttModel() : defaults.sttModel(),
                voice.preferModelAudio() != null ? voice.preferModelAudio() : defaults.preferModelAudio(),
                voice.ttsVoice() != null ? voice.ttsVoice() : defaults.ttsVoice(),
                voice.ttsLangCode() != null ? voice.ttsLangCode() : defaults.ttsLangCode(),
                voice.ttsSpeed() != null ? voice.ttsSpeed() : defaults.ttsSpeed());
    }

    /** Creates a new conversation (title from the first message) and its optional persona system row. */
    private ConversationRow createConversation(ChatSendCommand command) {
        ModelRow model = modelService.getOrCreateModel(command.provider(), command.model());
        // Scoped to a note when the client says so, not when the turn happens to carry note text:
        // an empty note (or "Chat context: None") sends no context but is still a note chat, and
        // tagging it 'simple' would leak the thread into the chat history and the ⌘K palette.
        String mode = command.noteChat() ? ConversationRepository.NOTE_MODE : DEFAULT_MODE;
        ConversationRow conversation = conversationRepository.insert(
                model.id(), deriveTitle(command.content()), mode, settingsFrom(command.options()),
                command.voice().toSettings());
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

    /**
     * Persists this turn's voice settings onto an existing conversation when they changed. No
     * marker row and no {@code chat.settings} frame, unlike {@link #applySettingsChange}: these are
     * capture/playback preferences, not sampling params, so a change doesn't divide the thread.
     */
    private void applyVoiceChange(ConversationRow conversation, VoiceSettings voice) {
        if (!conversation.voice().equals(voice)) {
            conversationRepository.updateVoiceSettings(conversation.id(), voice);
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
     * Earlier turns stay text-only, matching the AI core's "most recent media only" behavior.
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
     * Inserts the note this turn is about as a system message immediately before the current user
     * message — adjacent to the question, so the freshest copy is what the model reads.
     *
     * <p>Deliberately <em>not</em> persisted: it never lands in {@code messages}, so it cannot go
     * stale and cannot pile up a copy per turn in a conversation's replayed history.
     */
    private static List<ChatMessage> withNoteContext(List<ChatMessage> history, String noteContext, boolean noteChat) {
        if (noteContext == null || history.isEmpty()) {
            return history;
        }
        // Only a turn from the notes panel gets the edit protocol: it is the one surface with an
        // editor to apply a proposed block in. A note attached to an ordinary chat stays read-only.
        //
        // Blank but present means the note exists and is empty — a fresh draft. It still gets the
        // protocol, and is told so explicitly, because "write me a note about X" is exactly the
        // turn that needs to come back as an appliable block rather than as prose. Context "None"
        // is the other case, and it omits the field entirely rather than sending "".
        if (noteChat) {
            String body = noteContext.isBlank() ? EMPTY_NOTE_BODY : noteContext.strip();
            return insertSystemBeforeTurn(history, NOTE_EDIT_PROTOCOL + body);
        }
        if (noteContext.isBlank()) {
            return history;
        }
        return insertSystemBeforeTurn(history, NOTE_CONTEXT_PREAMBLE + noteContext.strip());
    }

    /**
     * Whether this turn already carries {@link #NOTE_EDIT_PROTOCOL}, and with it the mermaid rules.
     * Mirrors {@link #withNoteContext}'s own guard: a notes turn sent with context "None" omits
     * {@code noteContext} altogether and so gets no protocol, despite {@code noteChat} being true.
     */
    private static boolean carriesNoteProtocol(String noteContext, boolean noteChat) {
        return noteChat && noteContext != null;
    }

    /**
     * Inserts an ephemeral system message immediately before the current user turn — adjacent to
     * the question, and never persisted, so it can neither go stale nor accumulate across turns.
     */
    private static List<ChatMessage> insertSystemBeforeTurn(List<ChatMessage> history, String text) {
        if (history.isEmpty()) {
            return history;
        }
        List<ChatMessage> updated = new ArrayList<>(history);
        updated.add(updated.size() - 1, new ChatMessage(ROLE_SYSTEM, text));
        return updated;
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
                                     String transcript, String sttModel, ChatStreamListener listener) {
        if (transcript != null) {
            messageRepository.updateContent(userMessageId, transcript);
            return transcript;
        }
        String content = transcribeClips(audioClips, sttModel);
        if (content == null || content.isBlank()) {
            return null;
        }
        messageRepository.updateContent(userMessageId, content);
        listener.onTranscript(content);
        return content;
    }

    /**
     * Titles a conversation that started without one from its first spoken turn — a voice turn
     * carries no typed text, so {@link #createConversation} couldn't derive a title at creation.
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

    /**
     * STT fallback: transcribes the first readable clip when the model skipped the delimiter, using
     * the conversation's own STT model. A model id the AI core rejects (one dropped from its
     * allowlist since) fails this pass, not the turn — the catch below logs it and the spoken
     * message simply stays blank.
     */
    private String transcribeClips(List<MediaRow> audioClips, String sttModel) {
        for (MediaRow clip : audioClips) {
            byte[] bytes = mediaService.bytes(clip);
            if (bytes == null || bytes.length == 0) {
                continue;
            }
            try {
                String text = audioClient.transcribe(bytes, clip.originalFilename(), sttModel);
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

        /**
         * The assistant turn finished. {@code contextTokens} is the conversation's context size in
         * tokens (the prompt fed to the model this turn) for the context meter, or {@code null} when
         * the provider reported no counts.
         */
        void onComplete(long messageId, Long contextTokens);

        /** Generation failed after the conversation existed; an error message was persisted. */
        void onError(long messageId, String message);
    }
}
