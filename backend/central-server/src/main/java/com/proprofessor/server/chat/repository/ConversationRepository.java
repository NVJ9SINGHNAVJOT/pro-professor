package com.proprofessor.server.chat.repository;

import com.proprofessor.server.chat.dto.ChatSearchResult;
import com.proprofessor.server.common.db.ConversationRow;
import com.proprofessor.server.common.db.ConversationSettings;
import com.proprofessor.server.common.db.VoiceSettings;
import com.proprofessor.server.common.db.ModelRow;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

import static com.proprofessor.server.db.Tables.CONVERSATIONS;
import static com.proprofessor.server.db.Tables.MODELS;

@Repository
public class ConversationRepository {

    /**
     * {@code conversations.mode} for a conversation started from a note's chat panel. Metadata
     * only — nothing branches on it except {@link #findAll}, which hides these rows.
     */
    public static final String NOTE_MODE = "note";

    private final DSLContext dsl;

    public ConversationRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /**
     * The chat history list. Excludes note-scoped conversations (those started from a note's chat
     * panel) — they belong to their note, not to the chat screen's history. {@link #findById} is
     * unfiltered, so one can still be opened directly.
     */
    public List<ConversationRow> findAll() {
        return dsl.select()
                .from(CONVERSATIONS)
                .join(MODELS).on(CONVERSATIONS.MODEL_ID.eq(MODELS.ID))
                .where(CONVERSATIONS.MODE.ne(NOTE_MODE))
                .orderBy(CONVERSATIONS.UPDATED_AT.desc())
                .fetch(this::toRow);
    }

    /** How many hits the ⌘K palette shows for chats — it lists notes beside them. */
    private static final int SEARCH_LIMIT = 30;

    /**
     * Full-text search over chat messages, for the ⌘K palette.
     *
     * Plain SQL rather than the DSL: this needs {@code DISTINCT ON} to collapse a conversation's
     * many matching messages down to its best one, {@code ts_headline} for the excerpt, and the
     * tsquery bound once and reused in three places — all of which read far worse assembled from
     * {@code DSL.field("...")} fragments than written out.
     *
     * Title matches ride along in the same pass so naming a chat finds it even when nothing said
     * inside it does; those rank 0 and fall below genuine content hits. Note-scoped conversations
     * are excluded exactly as in {@link #findAll} — they belong to their note, not to chat.
     */
    public List<ChatSearchResult> search(String query) {
        String sql = """
                SELECT s.id, s.title, s.snippet, s.updated_at
                  FROM (SELECT DISTINCT ON (c.id)
                               c.id,
                               c.title,
                               c.updated_at,
                               ts_headline('english', m.content, q.tsq,
                                           'MaxFragments=1,MaxWords=22,MinWords=8,StartSel=,StopSel=') AS snippet,
                               ts_rank(m.content_tsv, q.tsq) AS rank
                          FROM conversations c
                          JOIN messages m ON m.conversation_id = c.id
                          CROSS JOIN websearch_to_tsquery('english', ?) AS q(tsq)
                         WHERE c.mode <> ?
                           AND (m.content_tsv @@ q.tsq OR c.title ILIKE ?)
                         ORDER BY c.id, rank DESC, m.created_at) s
                 ORDER BY s.rank DESC, s.updated_at DESC
                 LIMIT ?
                """;
        return dsl.fetch(sql, query, NOTE_MODE, "%" + query + "%", SEARCH_LIMIT)
                .map(r -> new ChatSearchResult(
                        r.get("id", Long.class),
                        r.get("title", String.class),
                        r.get("snippet", String.class),
                        r.get("updated_at", java.time.Instant.class)));
    }

    public Optional<ConversationRow> findById(long id) {
        return dsl.select()
                .from(CONVERSATIONS)
                .join(MODELS).on(CONVERSATIONS.MODEL_ID.eq(MODELS.ID))
                .where(CONVERSATIONS.ID.eq(id))
                .fetchOptional(this::toRow);
    }

    public ConversationRow insert(long modelId, String title, String mode,
                                  ConversationSettings settings, VoiceSettings voice) {
        Long id = dsl.insertInto(CONVERSATIONS)
                .set(CONVERSATIONS.MODEL_ID, modelId)
                .set(CONVERSATIONS.TITLE, title)
                .set(CONVERSATIONS.MODE, mode)
                .set(CONVERSATIONS.MAX_TOKENS, settings.maxTokens())
                .set(CONVERSATIONS.TEMPERATURE, settings.temperature())
                .set(CONVERSATIONS.TOP_P, settings.topP())
                .set(CONVERSATIONS.REPETITION_PENALTY, settings.repetitionPenalty())
                .set(CONVERSATIONS.VERBOSE_ENABLED, settings.verbose())
                .set(CONVERSATIONS.THINKING_ENABLED, settings.thinkingEnabled())
                .set(CONVERSATIONS.STT_MODEL, voice.sttModel())
                .set(CONVERSATIONS.PREFER_MODEL_AUDIO, voice.preferModelAudio())
                .set(CONVERSATIONS.TTS_VOICE, voice.ttsVoice())
                .set(CONVERSATIONS.TTS_LANG_CODE, voice.ttsLangCode())
                .set(CONVERSATIONS.TTS_SPEED, voice.ttsSpeed())
                .returning(CONVERSATIONS.ID)
                .fetchOne(CONVERSATIONS.ID);
        return findById(id).orElseThrow();
    }

    /** Sets a conversation's title — used to backfill a voice-started chat from its first transcript. */
    public void updateTitle(long id, String title) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.TITLE, title)
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    /** Records the conversation's context usage (tokens) after a turn, for the context meter. */
    public void updateLastContextTokens(long id, int tokens) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.LAST_CONTEXT_TOKENS, tokens)
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    /**
     * Marks a conversation as just-used. The value set here is irrelevant — {@code
     * trg_conversations_updated_at} overwrites it with {@code NOW()} — the point is that an UPDATE
     * happens at all, so a turn always moves the conversation to the top of the history list. The
     * other updates on this row are conditional (token metrics, changed settings, a derived title),
     * so without this a stopped or failed turn would leave the row where it was.
     */
    public void touch(long id) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.UPDATED_AT, DSL.currentOffsetDateTime())
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    /** Overwrites a conversation's voice settings — used when the user changes them mid-chat. */
    public void updateVoiceSettings(long id, VoiceSettings voice) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.STT_MODEL, voice.sttModel())
                .set(CONVERSATIONS.PREFER_MODEL_AUDIO, voice.preferModelAudio())
                .set(CONVERSATIONS.TTS_VOICE, voice.ttsVoice())
                .set(CONVERSATIONS.TTS_LANG_CODE, voice.ttsLangCode())
                .set(CONVERSATIONS.TTS_SPEED, voice.ttsSpeed())
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    /** Overwrites a conversation's inference settings — used when the user changes them mid-chat. */
    public void updateSettings(long id, ConversationSettings settings) {
        dsl.update(CONVERSATIONS)
                .set(CONVERSATIONS.MAX_TOKENS, settings.maxTokens())
                .set(CONVERSATIONS.TEMPERATURE, settings.temperature())
                .set(CONVERSATIONS.TOP_P, settings.topP())
                .set(CONVERSATIONS.REPETITION_PENALTY, settings.repetitionPenalty())
                .set(CONVERSATIONS.VERBOSE_ENABLED, settings.verbose())
                .set(CONVERSATIONS.THINKING_ENABLED, settings.thinkingEnabled())
                .where(CONVERSATIONS.ID.eq(id))
                .execute();
    }

    public boolean existsById(long id) {
        return dsl.fetchExists(CONVERSATIONS, CONVERSATIONS.ID.eq(id));
    }

    public void deleteById(long id) {
        dsl.deleteFrom(CONVERSATIONS).where(CONVERSATIONS.ID.eq(id)).execute();
    }

    private ConversationRow toRow(Record r) {
        ModelRow model = new ModelRow(
                r.get(MODELS.ID),
                r.get(MODELS.NAME),
                r.get(MODELS.PROVIDER),
                r.get(MODELS.ROLE),
                r.get(MODELS.VERSION),
                r.get(MODELS.IS_ACTIVE),
                r.get(MODELS.CREATED_AT).toInstant(),
                r.get(MODELS.UPDATED_AT).toInstant()
        );
        ConversationSettings settings = new ConversationSettings(
                r.get(CONVERSATIONS.MAX_TOKENS),
                r.get(CONVERSATIONS.TEMPERATURE),
                r.get(CONVERSATIONS.TOP_P),
                r.get(CONVERSATIONS.REPETITION_PENALTY),
                Boolean.TRUE.equals(r.get(CONVERSATIONS.VERBOSE_ENABLED)),
                Boolean.TRUE.equals(r.get(CONVERSATIONS.THINKING_ENABLED))
        );
        VoiceSettings voice = new VoiceSettings(
                r.get(CONVERSATIONS.STT_MODEL),
                r.get(CONVERSATIONS.PREFER_MODEL_AUDIO),
                r.get(CONVERSATIONS.TTS_VOICE),
                r.get(CONVERSATIONS.TTS_LANG_CODE),
                r.get(CONVERSATIONS.TTS_SPEED)
        );
        return new ConversationRow(
                r.get(CONVERSATIONS.ID),
                model,
                r.get(CONVERSATIONS.TITLE),
                r.get(CONVERSATIONS.MODE),
                settings,
                voice,
                r.get(CONVERSATIONS.LAST_CONTEXT_TOKENS),
                r.get(CONVERSATIONS.CREATED_AT).toInstant(),
                r.get(CONVERSATIONS.UPDATED_AT).toInstant()
        );
    }
}
