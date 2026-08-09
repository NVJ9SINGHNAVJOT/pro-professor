package com.proprofessor.server.notes;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.notes.dto.NoteFolderCreateRequest;
import com.proprofessor.server.notes.dto.NoteFolderMoveRequest;
import com.proprofessor.server.notes.dto.NoteFolderRenameRequest;
import com.proprofessor.server.notes.dto.NoteFolderSummary;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for note folders. Thin — delegates to {@link NoteFolderService} and wraps results
 * in {@link ApiResponse}. There is no list endpoint: folders come back with the notes from
 * {@code GET /api/v1/notes}.
 *
 * <p>Its own path rather than {@code /notes/folders}, which would sit under the
 * {@code /notes/{id}} path variable.
 */
@RestController
@RequestMapping("/api/v1/note-folders")
public class NoteFolderController {

    private final NoteFolderService noteFolderService;

    public NoteFolderController(NoteFolderService noteFolderService) {
        this.noteFolderService = noteFolderService;
    }

    @PostMapping
    public ApiResponse<NoteFolderSummary> create(@RequestBody NoteFolderCreateRequest request) {
        return ApiResponse.ok("Folder created.", noteFolderService.createFolder(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<NoteFolderSummary> rename(@PathVariable Long id,
                                                 @RequestBody NoteFolderRenameRequest request) {
        return ApiResponse.ok("Folder renamed.", noteFolderService.renameFolder(id, request.name()));
    }

    /** Split from {@link #rename} so an absent field never has to mean "leave it alone". */
    @PutMapping("/{id}/parent")
    public ApiResponse<NoteFolderSummary> move(@PathVariable Long id,
                                               @RequestBody NoteFolderMoveRequest request) {
        return ApiResponse.ok("Folder moved.", noteFolderService.moveFolder(id, request.parentId()));
    }

    /** Takes the subfolders and every note inside them with it. */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        noteFolderService.deleteFolder(id);
        return ApiResponse.ok("Folder deleted.", null);
    }
}
