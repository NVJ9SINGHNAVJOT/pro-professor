package com.proprofessor.server.audio.dto;

/**
 * Payload for {@code POST /api/v1/audio/transcriptions} — the transcribed text,
 * wrapped by the standard {@code ApiResponse} envelope at the controller.
 *
 * @param text the transcript of the uploaded audio clip
 */
public record TranscriptionResponse(String text) {
}
