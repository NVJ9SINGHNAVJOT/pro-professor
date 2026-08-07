package com.proprofessor.server.chat.dto;

import com.proprofessor.server.model.dto.ModelProvider;

import java.util.List;

/**
 * Request body for {@code POST /api/v1/chats/send} (the SSE streaming chat endpoint).
 *
 * @param conversationId existing conversation, or {@code null} to start a new one
 * @param provider       required when {@code conversationId} is null
 * @param model          required when {@code conversationId} is null
 * @param content        the user's message text
 * @param attachmentIds  media ids (from {@code POST /api/v1/media/upload}) to attach, or {@code null}
 * @param systemPrompt   persona/instructions for a new conversation, or {@code null}; only honored
 *                       when {@code conversationId} is null (the first turn persists it as a system row)
 * @param noteContext    the note this turn is about, or {@code null}. Sent fresh on every turn and
 *                       injected into the prompt without being persisted, so it can neither go
 *                       stale (as {@code systemPrompt} would — it is only read on the first turn)
 *                       nor accumulate across turns. The caller sends it already trimmed to size.
 * @param noteChat       {@code true} when the turn came from a note's chat panel. Only honored when
 *                       {@code conversationId} is null, since the conversation's mode is fixed at
 *                       creation. Declared rather than inferred from {@code noteContext}: an empty
 *                       note (or "Chat context: None") sends no context but is still a note chat,
 *                       and mis-tagging leaks the thread into the chat history and the ⌘K palette.
 * @param maxTokens          max new tokens to generate, or {@code null} to use the stored defaults
 * @param temperature        sampling temperature, or {@code null} to use the stored defaults
 * @param topP               nucleus sampling top-p, or {@code null} to use the stored defaults
 * @param repetitionPenalty  repetition penalty, or {@code null} to use the stored defaults
 * @param verbose            when {@code true}, stream token/timing metrics back to the client
 * @param thinkingEnabled    UI preference (show the model's reasoning); persisted on the
 *                           conversation, not forwarded to the provider
 */
public record ChatSendRequest(
        Long conversationId,
        ModelProvider provider,
        String model,
        String content,
        List<Long> attachmentIds,
        String systemPrompt,
        String noteContext,
        Boolean noteChat,
        Integer maxTokens,
        Double temperature,
        Double topP,
        Double repetitionPenalty,
        Boolean verbose,
        Boolean thinkingEnabled
) {
}
