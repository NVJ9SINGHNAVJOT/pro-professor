package com.proprofessor.server.model.dto;

/**
 * A model as exposed to the frontend, normalized across providers.
 *
 * <p>Mirrors the Node {@code ProviderModel} shape so the frontend contract is
 * unchanged: {@code { name, provider, role, version, isActive }}.
 *
 * @param name     model identifier (e.g. {@code llama3.1} or a provider model id)
 * @param provider where the model comes from
 * @param role     {@code "chat"} or {@code "embedding"} (derived from the name)
 * @param version  version/parameter size if known, otherwise {@code null}
 * @param isActive whether the model is currently usable
 */
public record ProviderModel(
        String name,
        ModelProvider provider,
        String role,
        String version,
        boolean isActive
) {
}
