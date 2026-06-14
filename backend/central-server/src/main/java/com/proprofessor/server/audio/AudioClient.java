package com.proprofessor.server.audio;

import com.proprofessor.server.audio.dto.SpeechRequest;
import com.proprofessor.server.common.http.HttpClientFactory;
import com.proprofessor.server.config.properties.AppProperties;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * Talks to the Python AI service's OpenAI-compatible audio endpoints so the
 * frontend never calls the AI service directly.
 *
 * <p>STT and TTS run fully locally on the AI service (Whisper + Kokoro on MLX);
 * this client only forwards bytes through and returns the result.
 */
@Component
public class AudioClient {

    private static final String DEFAULT_FILENAME = "audio.webm";

    private final RestClient restClient;

    public AudioClient(AppProperties appProperties) {
        this.restClient = HttpClientFactory.forBaseUrl(appProperties.aiService().baseUrl());
    }

    /**
     * Forwards an audio clip to the AI service and returns its transcript.
     *
     * @param audio    the raw audio bytes
     * @param filename original filename — its extension hints the decoder, so it is preserved
     * @return the transcribed text
     */
    public String transcribe(byte[] audio, String filename) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new NamedByteArrayResource(audio, filename));

        AiTranscription result = restClient.post()
                .uri("/v1/audio/transcriptions")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
                .retrieve()
                .body(AiTranscription.class);

        return result == null ? "" : result.text();
    }

    /**
     * Forwards text to the AI service and returns synthesized WAV audio bytes.
     */
    public byte[] synthesize(SpeechRequest request) {
        return restClient.post()
                .uri("/v1/audio/speech")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(byte[].class);
    }

    /** A {@link ByteArrayResource} that carries a filename so the multipart part is named. */
    private static final class NamedByteArrayResource extends ByteArrayResource {
        private final String filename;

        private NamedByteArrayResource(byte[] bytes, String filename) {
            super(bytes);
            this.filename = (filename == null || filename.isBlank()) ? DEFAULT_FILENAME : filename;
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }

    /** AI service transcription response shape: {@code {"text": ...}}. */
    private record AiTranscription(String text) {
    }
}
