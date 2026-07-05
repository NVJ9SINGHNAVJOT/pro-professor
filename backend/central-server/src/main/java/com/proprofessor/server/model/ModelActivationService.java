package com.proprofessor.server.model;

import com.proprofessor.server.common.exception.ModelBusyException;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.provider.AiServiceClient;
import com.proprofessor.server.model.provider.OllamaClient;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Enforces the global "one model resident at a time" invariant across both inference engines.
 *
 * <p>Ollama and the AI service each hold their own model in memory independently, so without
 * coordination a warm Ollama model and a loaded AI-service model can occupy memory at once. This
 * service is the single gatekeeper: before a model is used it unloads whatever else is resident on
 * the other engine (and any different Ollama model), so only the target stays loaded.
 *
 * <p>While a chat turn is generating, a request for a <em>different</em> model is rejected with a
 * {@link ModelBusyException} rather than evicting the in-flight model. Requests for the same model
 * are allowed (still one model in memory). State is in-memory — this is a single-user local app.
 */
@Service
public class ModelActivationService {

    private static final Logger log = LoggerFactory.getLogger(ModelActivationService.class);

    private final OllamaClient ollamaClient;
    private final AiServiceClient aiServiceClient;

    /** Guards all mutable state below. Held only for the brief activate/counter work, never a stream. */
    private final Object lock = new Object();

    /** The model currently resident (last activated); {@code null} until the first activation. */
    private ActiveModel active;
    /** The last Ollama model we loaded — Ollama keeps it warm — so we know what to unload on a switch. */
    private String residentOllamaModel;
    /** Chat turns currently streaming. While {@code > 0} the active model can't be swapped out. */
    private int inFlight;

    public ModelActivationService(OllamaClient ollamaClient, AiServiceClient aiServiceClient) {
        this.ollamaClient = ollamaClient;
        this.aiServiceClient = aiServiceClient;
    }

    /**
     * Reserves the model for a streaming turn: ensures it is the only one resident and marks a turn
     * in flight. Throws {@link ModelBusyException} when a different model is mid-generation. Every
     * successful call must be paired with {@link #releaseAfterChat()} in a {@code finally} block.
     */
    public void acquireForChat(ModelProvider provider, String name) {
        synchronized (lock) {
            if (inFlight > 0 && !isActive(provider, name)) {
                throw new ModelBusyException(active.name());
            }
            activate(provider, name);
            inFlight++;
        }
    }

    /** Releases a turn reserved by {@link #acquireForChat}. Safe to call once per successful acquire. */
    public void releaseAfterChat() {
        synchronized (lock) {
            if (inFlight > 0) {
                inFlight--;
            }
        }
    }

    /**
     * Loads a model outside a chat turn (e.g. a selector preload). Ensures it is the only one resident.
     * Throws {@link ModelBusyException} when a different model is mid-generation.
     */
    public void load(ModelProvider provider, String name) {
        synchronized (lock) {
            if (inFlight > 0 && !isActive(provider, name)) {
                throw new ModelBusyException(active.name());
            }
            activate(provider, name);
        }
    }

    /**
     * Frees VRAM on shutdown by unloading whatever model is resident. Runs during bean destruction,
     * which happens after the web server's graceful shutdown has drained in-flight streams, so it
     * never evicts a model mid-generation. Best-effort: the unload calls log-and-swallow, so a downed
     * engine can't hang shutdown.
     */
    @PreDestroy
    public void unloadResident() {
        synchronized (lock) {
            if (active != null && active.provider() == ModelProvider.AI_SERVICE) {
                aiServiceClient.unload();
            }
            if (residentOllamaModel != null) {
                ollamaClient.unload(residentOllamaModel);
                residentOllamaModel = null;
            }
            active = null;
        }
    }

    /**
     * Makes {@code (provider, name)} the only resident model: unloads the AI service unless it is the
     * target, unloads the previously-resident Ollama model unless it is the target, then loads the
     * target (the AI service swaps its own models; Ollama loads lazily on the chat request). Must be
     * called while holding {@link #lock}. A no-op when the target is already active.
     */
    private void activate(ModelProvider provider, String name) {
        if (isActive(provider, name)) {
            return;
        }
        if (provider != ModelProvider.AI_SERVICE) {
            aiServiceClient.unload();
        }
        if (residentOllamaModel != null
                && !(provider == ModelProvider.OLLAMA && residentOllamaModel.equals(name))) {
            ollamaClient.unload(residentOllamaModel);
            residentOllamaModel = null;
        }
        if (provider == ModelProvider.AI_SERVICE) {
            aiServiceClient.loadModel(name);
        } else {
            // Ollama has no preload step here — the chat request loads it — but record it so the next
            // switch knows which Ollama model to evict. (A native preload would warm Ollama's KV cache
            // and deflate the prompt-token count the context meter relies on.)
            residentOllamaModel = name;
        }
        active = new ActiveModel(provider, name);
        log.info("Active model is now {} ({})", name, provider.getValue());
    }

    private boolean isActive(ModelProvider provider, String name) {
        return active != null && active.provider() == provider && active.name().equals(name);
    }

    private record ActiveModel(ModelProvider provider, String name) {
    }
}
