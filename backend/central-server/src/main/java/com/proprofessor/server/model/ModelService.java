package com.proprofessor.server.model;

import com.proprofessor.server.common.db.ModelRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.model.dto.ModelProvider;
import com.proprofessor.server.model.dto.ProviderModel;
import com.proprofessor.server.model.provider.AiCoreClient;
import com.proprofessor.server.model.provider.OllamaClient;
import com.proprofessor.server.model.repository.ModelRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;

@Service
public class ModelService {

    private static final Logger log = LoggerFactory.getLogger(ModelService.class);

    private static final Comparator<ProviderModel> BY_PROVIDER_THEN_NAME =
            Comparator.comparing((ProviderModel m) -> m.provider().getValue())
                    .thenComparing(ProviderModel::name);

    private final OllamaClient ollamaClient;
    private final AiCoreClient aiCoreClient;
    private final ModelRepository modelRepository;
    private final ModelActivationService modelActivationService;

    public ModelService(OllamaClient ollamaClient, AiCoreClient aiCoreClient,
                        ModelRepository modelRepository, ModelActivationService modelActivationService) {
        this.ollamaClient = ollamaClient;
        this.aiCoreClient = aiCoreClient;
        this.modelRepository = modelRepository;
        this.modelActivationService = modelActivationService;
    }

    public List<ProviderModel> getAllModels() {
        List<ProviderModel> models = new ArrayList<>();
        models.addAll(fetchTolerant(ollamaClient::getModels, ModelProvider.OLLAMA));
        models.addAll(fetchTolerant(aiCoreClient::getModels, ModelProvider.AI_CORE));

        if (models.isEmpty()) {
            throw new AppException(HttpStatus.BAD_GATEWAY,
                    "Unable to fetch models from Ollama and AI Core.");
        }

        models.sort(BY_PROVIDER_THEN_NAME);
        return models;
    }

    public void loadModel(String name) {
        // The load endpoint only serves AI-core models; route it through the gatekeeper so it also
        // frees the other engine and is rejected while a different model is mid-generation.
        modelActivationService.load(ModelProvider.AI_CORE, name);
    }

    @Transactional
    public ModelRow getOrCreateModel(ModelProvider provider, String name) {
        return modelRepository.findByProviderAndName(provider.getValue(), name)
                .orElseGet(() -> modelRepository.insert(name, provider.getValue(), "chat", null, true));
    }

    private List<ProviderModel> fetchTolerant(Supplier<List<ProviderModel>> fetch, ModelProvider provider) {
        try {
            return fetch.get();
        } catch (Exception ex) {
            log.warn("Failed to fetch models from provider '{}': {}", provider.getValue(), ex.getMessage());
            return List.of();
        }
    }
}
