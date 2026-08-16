package com.proprofessor.server.chat;

import com.proprofessor.server.model.dto.ModelProvider;

import java.util.List;

/**
 * Internal command describing a send request (built by the chat controller from
 * a {@code POST /api/v1/chats/send} body). Not a wire DTO.
 *
 * @param conversationId existing conversation, or {@code null} to start a new one
 * @param provider       required when {@code conversationId} is null
 * @param model          required when {@code conversationId} is null
 * @param content        the user's message text
 * @param attachmentIds  media ids to attach to the user message (never {@code null}; may be empty)
 * @param systemPrompt   persona/instructions persisted as a system row when starting a new
 *                       conversation; ignored for existing conversations (may be {@code null}/blank)
 * @param noteContext    the note this turn is about, or {@code null}; injected for this turn only
 *                       and never persisted (see {@code ChatService.generate})
 * @param noteChat       whether the turn came from a note's chat panel; decides the new
 *                       conversation's mode, and so whether it appears in the chat history
 * @param options        per-request inference settings (never {@code null}; see {@link InferenceOptions})
 * @param voice          per-request voice settings (never {@code null}; see {@link VoiceOptions})
 */
public record ChatSendCommand(
        Long conversationId,
        ModelProvider provider,
        String model,
        String content,
        List<Long> attachmentIds,
        String systemPrompt,
        String noteContext,
        boolean noteChat,
        InferenceOptions options,
        VoiceOptions voice
) {
    /** This command with resolved inference settings — see {@code ChatService.withDefaults}. */
    public ChatSendCommand withOptions(InferenceOptions resolved) {
        return new ChatSendCommand(conversationId, provider, model, content, attachmentIds,
                systemPrompt, noteContext, noteChat, resolved, voice);
    }

    /** This command with resolved voice settings — see {@code ChatService.withVoiceDefaults}. */
    public ChatSendCommand withVoice(VoiceOptions resolved) {
        return new ChatSendCommand(conversationId, provider, model, content, attachmentIds,
                systemPrompt, noteContext, noteChat, options, resolved);
    }
}
