package com.proprofessor.server.diagram.ai;

import com.proprofessor.server.chat.InferenceOptions;
import com.proprofessor.server.chat.provider.ChatCompletionClient;
import com.proprofessor.server.chat.provider.dto.ChatMessage;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.diagram.ai.dto.DiagramAiRequest;
import com.proprofessor.server.diagram.repository.DiagramRepository;
import com.proprofessor.server.model.ModelActivationService;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.settings.SettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * AI diagram edits via a local model (Ollama / AI service through the
 * OpenAI-compatible chat path). The server only produces the model's raw reply
 * — buffered to completion and handed to the client, whose ajv gate is the
 * single validator and applier. The repair retry is client-driven: an invalid
 * reply comes back here with {@code priorReply} + {@code validationErrors} and
 * the conversation is rebuilt with that feedback.
 */
@Service
public class DiagramAiService {

    /** Pins the JSON-only command-list contract; the semantic JSON is the model's whole world. */
    private static final String SYSTEM_PROMPT = """
            You are a diagram-editing assistant. A diagram is defined by SEMANTIC JSON only: \
            nodes (id, type, label) and edges (id, source, target, type, optional label). \
            Registered node types: service, database, note. Registered edge types: straight, curved. \
            You NEVER decide positions — layout belongs to the user and is not part of your world. \
            Respond with ONLY one JSON object, no prose and no code fence, of this exact shape: \
            {"commands":[ ... ]} \
            Allowed commands: \
            {"op":"addNode","node":{"id":"...","type":"service|database|note","label":"..."}} \
            {"op":"deleteNode","id":"..."} \
            {"op":"renameNode","id":"...","label":"..."} \
            {"op":"connectNodes","source":"...","target":"...","type":"straight|curved","label":"..."} (type and label optional) \
            {"op":"deleteEdge","id":"..."} \
            Use short kebab-case ids for new nodes. Reference only ids that exist in the given semantic \
            JSON, or that an earlier command in your own list adds.""";

    /** Streaming callbacks for an AI diagram edit (mirrors {@code NoteAiStreamListener}). */
    public interface DiagramAiStreamListener {
        void onStart(long diagramId);

        void onToken(String delta);

        void onComplete(long diagramId, String raw);
    }

    private final DiagramRepository diagramRepository;
    private final ChatCompletionClient chatCompletionClient;
    private final ModelActivationService modelActivationService;
    private final SettingsService settingsService;

    public DiagramAiService(
            DiagramRepository diagramRepository,
            ChatCompletionClient chatCompletionClient,
            ModelActivationService modelActivationService,
            SettingsService settingsService) {
        this.diagramRepository = diagramRepository;
        this.chatCompletionClient = chatCompletionClient;
        this.modelActivationService = modelActivationService;
        this.settingsService = settingsService;
    }

    /**
     * Streams the model's command-list reply for the edit. Tokens go to the listener
     * as progress; the full buffered reply is delivered once at the end. Nothing is
     * saved here — the client validates, applies, and saves explicitly.
     */
    public void streamDiagramEdit(long diagramId, DiagramAiRequest request, DiagramAiStreamListener listener) {
        diagramRepository.findById(diagramId)
                .orElseThrow(() -> new ResourceNotFoundException("Diagram not found: " + diagramId));
        if (request.instruction() == null || request.instruction().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "An instruction is required for an AI edit.");
        }
        if (request.semantic() == null || !request.semantic().isObject()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "The current semantic JSON is required.");
        }

        listener.onStart(diagramId);
        String reply = streamFromLocalModel(request, listener);
        listener.onComplete(diagramId, reply);
    }

    private String streamFromLocalModel(DiagramAiRequest request, DiagramAiStreamListener listener) {
        ModelProvider provider = resolveLocalProvider(request.provider());
        if (request.model() == null || request.model().isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "A model is required for the local provider.");
        }
        InferenceOptions options = settingsService.diagramInferenceOptions();

        modelActivationService.acquireForChat(provider, request.model());
        try {
            return chatCompletionClient.streamChat(
                    provider, request.model(), buildMessages(request), options,
                    listener::onToken,
                    thinking -> {
                        // reasoning tokens are never part of the patch — drop them
                    },
                    metrics -> {
                        // diagram edits surface no metrics
                    });
        } finally {
            modelActivationService.releaseAfterChat();
        }
    }

    /** First attempt: system + task. Repair retry: the invalid reply + errors ride along as context. */
    private static List<ChatMessage> buildMessages(DiagramAiRequest request) {
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(new ChatMessage("system", SYSTEM_PROMPT));
        messages.add(new ChatMessage("user",
                "Task: apply this instruction to the diagram.\nInstruction: " + request.instruction().trim()
                        + "\n\nCurrent diagram semantic JSON:\n" + request.semantic().toString()));
        if (request.priorReply() != null && request.validationErrors() != null) {
            messages.add(new ChatMessage("assistant", request.priorReply()));
            messages.add(new ChatMessage("user",
                    "Your previous reply was rejected by validation:\n" + request.validationErrors()
                            + "\nReturn ONLY the corrected {\"commands\":[...]} JSON object — nothing else."));
        }
        return messages;
    }

    private static ModelProvider resolveLocalProvider(String provider) {
        if (provider == null) {
            throw new AppException(HttpStatus.BAD_REQUEST, "A provider is required (ollama or ai-service).");
        }
        return switch (provider.toLowerCase().replace('_', '-')) {
            case "ollama" -> ModelProvider.OLLAMA;
            case "ai-service" -> ModelProvider.AI_SERVICE;
            default -> throw new AppException(HttpStatus.BAD_REQUEST, "Unknown provider: " + provider);
        };
    }
}
