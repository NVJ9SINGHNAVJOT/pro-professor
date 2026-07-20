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

    /** Pins the JSON-only two-mode contract; the semantic summary is the model's whole world. */
    private static final String SYSTEM_PROMPT = """
            You are a diagram-editing assistant for an Excalidraw canvas. The current diagram is given as a \
            SEMANTIC SUMMARY: nodes (id, label, shape) and edges (id, source, target, optional label). \
            You edit in ONE of two modes and respond with ONLY one JSON object — no prose, no code fence: \
            MODE A — GENERATE (use when the diagram is empty or the user asks to draw/create a new diagram): \
            reply {"mermaid":"<a Mermaid flowchart>"}, e.g. {"mermaid":"flowchart TD\\n  A[Client] --> B[API]\\n  B --> C[(Database)]"}. \
            Prefer 'flowchart TD' or 'flowchart LR'. The flowchart is converted into editable shapes. \
            MODE B — EDIT (use for incremental changes to the existing diagram): reply {"commands":[ ... ]}. \
            A node's shape is one of: rectangle, ellipse, diamond. Node style may set {"fill","stroke"} (CSS colors). \
            Edge style may set {"dashed":true|false,"arrow":"none|end|both","color":"..."}. \
            You NEVER decide positions — layout belongs to the user and is not part of your world. \
            Allowed commands: \
            {"op":"addNode","node":{"id":"...","label":"...","shape":"rectangle|ellipse|diamond","style":{"fill":"...","stroke":"..."}}} (shape and style optional) \
            {"op":"deleteNode","id":"..."} \
            {"op":"renameNode","id":"...","label":"..."} \
            {"op":"styleNode","id":"...","shape":"...","style":{"fill":"...","stroke":"..."}} (all fields but id optional) \
            {"op":"connectNodes","source":"...","target":"...","label":"..."} (label and id optional) \
            {"op":"deleteEdge","id":"..."} \
            {"op":"styleEdge","id":"...","style":{"dashed":true,"arrow":"end","color":"..."}} (style optional) \
            Use short kebab-case ids for new nodes. In EDIT mode reference only ids that exist in the given \
            summary, or that an earlier command in your own list adds.""";

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
                        + "\n\nCurrent diagram semantic summary:\n" + request.semantic().toString()));
        if (request.priorReply() != null && request.validationErrors() != null) {
            messages.add(new ChatMessage("assistant", request.priorReply()));
            messages.add(new ChatMessage("user",
                    "Your previous reply was rejected:\n" + request.validationErrors()
                            + "\nReturn ONLY the corrected JSON object ({\"mermaid\":\"...\"} or {\"commands\":[...]}) — nothing else."));
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
