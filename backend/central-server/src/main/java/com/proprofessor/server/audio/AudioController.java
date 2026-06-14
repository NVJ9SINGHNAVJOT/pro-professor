package com.proprofessor.server.audio;

import com.proprofessor.server.audio.dto.SpeechRequest;
import com.proprofessor.server.audio.dto.TranscriptionResponse;
import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.common.exception.AppException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * Pass-through REST endpoints for voice: speech-to-text and text-to-speech.
 * Thin — forwards to the AI service via {@link AudioClient} so the frontend
 * never talks to the AI service directly.
 */
@RestController
@RequestMapping("/api/v1/audio")
public class AudioController {

    private final AudioClient audioClient;

    public AudioController(AudioClient audioClient) {
        this.audioClient = audioClient;
    }

    /** Transcribes an uploaded audio clip to text. */
    @PostMapping(value = "/transcriptions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<TranscriptionResponse> transcribe(
            @RequestParam(value = "file", required = false) MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Audio file is required.");
        }
        try {
            String text = audioClient.transcribe(file.getBytes(), file.getOriginalFilename());
            return ApiResponse.ok(new TranscriptionResponse(text));
        } catch (IOException ex) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Could not read the uploaded audio file.");
        }
    }

    /** Synthesizes text to speech and returns WAV audio bytes. */
    @PostMapping(value = "/speech", produces = "audio/wav")
    public ResponseEntity<byte[]> speech(@Valid @RequestBody SpeechRequest request) {
        byte[] audio = audioClient.synthesize(request);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/wav"))
                .body(audio);
    }
}
