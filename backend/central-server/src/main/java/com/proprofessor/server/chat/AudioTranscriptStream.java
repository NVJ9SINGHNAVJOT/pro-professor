package com.proprofessor.server.chat;

import java.util.function.Consumer;

/**
 * Splits an audio-capable model's streamed output into the user's transcript and the model's reply.
 * The model is instructed to emit {@code <transcript>the user's words</transcript>} first, then its
 * reply. Tokens are consumed as they stream:
 * <ul>
 *   <li>text inside the {@code <transcript>…</transcript>} block is captured as the transcript and
 *       <em>not</em> forwarded (UI/TTS must never see it);</li>
 *   <li>text after {@code </transcript>} is the reply and is forwarded to {@code replySink}
 *       exactly as it arrives.</li>
 * </ul>
 * The opening and closing tags may be split across token boundaries; the buffer holds back unmatched
 * text until a tag completes. Matching is case-insensitive.
 *
 * <p>The captured transcript is emitted to {@code transcriptSink} the moment {@code </transcript>}
 * closes — before the reply streams — so the user's bubble fills early, matching the text path.
 *
 * <p>If the model never closes a transcript block (it ignored the format), {@link #finish} flushes
 * the entire raw output to {@code replySink} as the reply and {@link #transcript()} reports
 * {@code null}, so the caller can fall back to a separate STT pass for the user's words.
 */
final class AudioTranscriptStream {

    private static final String OPEN = "<transcript>";
    private static final String CLOSE = "</transcript>";

    private enum Phase { SEEKING, IN_TRANSCRIPT, IN_REPLY }

    private final Consumer<String> replySink;
    private final Consumer<String> transcriptSink;
    private final StringBuilder buffer = new StringBuilder();
    private final StringBuilder transcript = new StringBuilder();
    private final StringBuilder reply = new StringBuilder();
    private Phase phase = Phase.SEEKING;
    private String capturedTranscript;

    AudioTranscriptStream(Consumer<String> replySink, Consumer<String> transcriptSink) {
        this.replySink = replySink;
        this.transcriptSink = transcriptSink;
    }

    /** Feeds one streamed token through the splitter, forwarding only reply text downstream. */
    void accept(String token) {
        if (phase == Phase.IN_REPLY) {
            forwardReply(token);
            return;
        }
        buffer.append(token);
        process();
    }

    private void process() {
        if (phase == Phase.SEEKING) {
            int open = indexOfIgnoreCase(buffer, OPEN);
            if (open < 0) {
                return; // the opening tag may still be arriving across tokens — keep buffering
            }
            buffer.delete(0, open + OPEN.length()); // drop any preamble and the opening tag
            phase = Phase.IN_TRANSCRIPT;
        }
        if (phase == Phase.IN_TRANSCRIPT) {
            int close = indexOfIgnoreCase(buffer, CLOSE);
            if (close < 0) {
                return; // accumulate the transcript until the closing tag arrives
            }
            transcript.append(buffer, 0, close);
            String afterClose = buffer.substring(close + CLOSE.length());
            buffer.setLength(0);
            phase = Phase.IN_REPLY;
            String captured = transcript.toString().strip();
            if (!captured.isEmpty()) {
                capturedTranscript = captured;
                transcriptSink.accept(captured); // fill the user bubble before any reply streams
            }
            if (!afterClose.isEmpty()) {
                forwardReply(afterClose);
            }
        }
    }

    private void forwardReply(String text) {
        reply.append(text);
        replySink.accept(text);
    }

    /**
     * Finalizes after the stream ends and returns the reply text to persist. When a complete
     * transcript block was parsed, the reply is everything after it (already forwarded live).
     * Otherwise the model ignored the format: the whole {@code raw} output (nothing was forwarded
     * while buffering) is flushed to the sink and returned as the reply.
     */
    String finish(String raw) {
        if (phase == Phase.IN_REPLY) {
            return reply.toString();
        }
        if (raw != null && !raw.isEmpty()) {
            reply.append(raw);
            replySink.accept(raw);
        }
        return reply.toString();
    }

    /** The captured user transcript (stripped), or {@code null} if the model didn't honor the format. */
    String transcript() {
        return capturedTranscript;
    }

    private static int indexOfIgnoreCase(CharSequence haystack, String needle) {
        int max = haystack.length() - needle.length();
        for (int i = 0; i <= max; i++) {
            if (regionMatchesIgnoreCase(haystack, i, needle)) {
                return i;
            }
        }
        return -1;
    }

    private static boolean regionMatchesIgnoreCase(CharSequence s, int offset, String needle) {
        for (int j = 0; j < needle.length(); j++) {
            if (Character.toLowerCase(s.charAt(offset + j)) != Character.toLowerCase(needle.charAt(j))) {
                return false;
            }
        }
        return true;
    }
}
