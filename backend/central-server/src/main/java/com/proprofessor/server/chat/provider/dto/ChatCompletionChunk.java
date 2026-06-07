package com.proprofessor.server.chat.provider.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * One streamed SSE frame from an OpenAI-compatible {@code /v1/chat/completions}
 * (the JSON after {@code data:}). We only need the incremental {@code delta.content}.
 * Unknown fields are ignored.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ChatCompletionChunk(
        List<Choice> choices
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Choice(
            Delta delta
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Delta(
            String content
    ) {
    }

    /** The token text in this frame, or {@code null} if this frame carries no content. */
    public String firstContent() {
        if (choices == null || choices.isEmpty()) {
            return null;
        }
        Choice choice = choices.getFirst();
        if (choice == null || choice.delta() == null) {
            return null;
        }
        return choice.delta().content();
    }
}
