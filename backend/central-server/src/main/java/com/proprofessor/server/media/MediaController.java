package com.proprofessor.server.media;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.media.dto.MediaListResponse;
import com.proprofessor.server.media.dto.MediaResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * REST endpoints for media: upload, list and delete. Uploads are stored in the storage-server and
 * referenced in Postgres; the upload response carries a <em>direct</em> storage-server URL the
 * browser downloads from itself. There is no download route here — the browser fetches file bytes
 * straight from the storage-server, so central-server never streams them. The list and delete
 * routes back the Settings → Storage browser and forward to the storage-server, which has no CORS
 * headers of its own.
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

    /**
     * Lists stored files, newest first. Every parameter is optional and forwarded to the
     * storage-server untouched, which applies the defaults and clamping.
     *
     * @param category one of {@code images|videos|audio|documents|others}; unset lists everything
     * @param sortBy   {@code created_at} (default) or {@code size}
     * @param order    {@code desc} (default) or {@code asc}
     * @param limit    page size, default 50, capped at 100
     * @param offset   how many files to skip
     */
    @GetMapping
    public ApiResponse<MediaListResponse> list(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String order,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        return ApiResponse.ok(mediaService.list(category, sortBy, order, limit, offset));
    }

    /**
     * Deletes a stored file and its reference row, keyed by the storage-server UUID (the list is
     * filesystem-backed, so some files have no row id). Refused with 409 while the file is still
     * attached to a chat message.
     */
    @DeleteMapping("/{storageId}")
    public ApiResponse<Void> delete(@PathVariable String storageId) {
        mediaService.delete(storageId);
        return ApiResponse.ok("File deleted.", null);
    }
}
