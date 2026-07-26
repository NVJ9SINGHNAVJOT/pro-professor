package com.proprofessor.server.diagram;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.diagram.dto.DiagramFolderCreateRequest;
import com.proprofessor.server.diagram.dto.DiagramFolderMoveRequest;
import com.proprofessor.server.diagram.dto.DiagramFolderRenameRequest;
import com.proprofessor.server.diagram.dto.DiagramFolderSummary;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for diagram folders. Thin — delegates to {@link DiagramFolderService} and wraps
 * results in {@link ApiResponse}. There is no list endpoint: folders come back with the diagrams
 * from {@code GET /api/v1/diagrams}.
 *
 * <p>Its own path rather than {@code /diagrams/folders}, which would sit under the
 * {@code /diagrams/{id}} path variable.
 */
@RestController
@RequestMapping("/api/v1/diagram-folders")
public class DiagramFolderController {

    private final DiagramFolderService diagramFolderService;

    public DiagramFolderController(DiagramFolderService diagramFolderService) {
        this.diagramFolderService = diagramFolderService;
    }

    @PostMapping
    public ApiResponse<DiagramFolderSummary> create(@RequestBody DiagramFolderCreateRequest request) {
        return ApiResponse.ok("Folder created.", diagramFolderService.createFolder(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<DiagramFolderSummary> rename(@PathVariable Long id,
                                                    @RequestBody DiagramFolderRenameRequest request) {
        return ApiResponse.ok("Folder renamed.", diagramFolderService.renameFolder(id, request.name()));
    }

    /** Split from {@link #rename} so an absent field never has to mean "leave it alone". */
    @PutMapping("/{id}/parent")
    public ApiResponse<DiagramFolderSummary> move(@PathVariable Long id,
                                                  @RequestBody DiagramFolderMoveRequest request) {
        return ApiResponse.ok("Folder moved.", diagramFolderService.moveFolder(id, request.parentId()));
    }

    /** Refused with 409 if any diagram in the subtree is still linked from a note. */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        diagramFolderService.deleteFolder(id);
        return ApiResponse.ok("Folder deleted.", null);
    }
}
