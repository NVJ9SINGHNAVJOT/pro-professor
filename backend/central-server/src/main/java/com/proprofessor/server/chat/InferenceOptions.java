package com.proprofessor.server.chat;

/**
 * Per-request inference settings forwarded to the provider's chat completion call.
 * Every field is nullable; a {@code null} means "use the provider default".
 *
 * @param maxTokens         max new tokens to generate
 * @param temperature       sampling temperature
 * @param topP              nucleus sampling top-p
 * @param repetitionPenalty repetition penalty (non-standard; sent as an extra body property)
 * @param verbose           when {@code true}, request and stream back token/timing metrics
 */
public record InferenceOptions(
        Integer maxTokens,
        Double temperature,
        Double topP,
        Double repetitionPenalty,
        boolean verbose
) {
    public static final InferenceOptions DEFAULTS = new InferenceOptions(null, null, null, null, false);
}
