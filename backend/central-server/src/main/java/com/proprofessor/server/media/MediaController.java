package com.proprofessor.server.media;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.media.dto.MediaResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * REST endpoints for media. Uploads are stored in the storage-server and referenced in
 * Postgres; the upload response carries a <em>direct</em> storage-server URL the browser
 * downloads from itself. There is no download route here — the browser fetches file bytes
 * straight from the storage-server, so central-server never streams them.
 */
@RestController
@RequestMapping("/api/v1/media")
public class MediaController {

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    /** Uploads a file and returns its reference (id + direct storage-server URL + metadata). */
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
}
