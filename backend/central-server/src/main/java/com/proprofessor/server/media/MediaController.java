package com.proprofessor.server.media;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.media.dto.MediaResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * Pass-through REST endpoints for media: upload a file (stored in the
 * storage-service, referenced in Postgres) and download it back. Thin —
 * delegates to {@link MediaService} so the frontend never talks to the
 * storage-service directly.
 */
@RestController
@RequestMapping("/api/v1/media")
public class MediaController {

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    /** Uploads a file and returns its reference (id + proxy URL + metadata). */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<MediaResponse> upload(
            @RequestParam(value = "file", required = false) MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        try {
            return ApiResponse.ok(mediaService.upload(file.getBytes(), file.getOriginalFilename()));
        } catch (IOException ex) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Could not read the uploaded file.");
        }
    }

    /** Streams the original bytes back, preserving the upstream {@code Content-Type}. */
    @GetMapping("/{id}/file")
    public ResponseEntity<byte[]> file(@PathVariable long id) {
        return mediaService.download(id);
    }
}
