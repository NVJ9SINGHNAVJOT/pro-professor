package com.proprofessor.server.model.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The source a model comes from. Serialized to / deserialized from the lowercase
 * wire value (e.g. {@code "ollama"}) to match the frontend contract.
 */
public enum ModelProvider {
    OLLAMA("ollama"),
    AI_SERVICE("ai-service");

    private final String value;

    ModelProvider(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    /** Resolves a wire/DB value (e.g. {@code "ai-service"}) back to the enum. */
    @JsonCreator
    public static ModelProvider fromValue(String value) {
        for (ModelProvider provider : values()) {
            if (provider.value.equals(value)) {
                return provider;
            }
        }
        throw new IllegalArgumentException("Unknown model provider: " + value);
    }
}
