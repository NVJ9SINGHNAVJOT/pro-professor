package com.proprofessor.server.diagram;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.diagram.dto.DiagramCreateRequest;
import com.proprofessor.server.diagram.dto.DiagramDetail;
import com.proprofessor.server.diagram.dto.DiagramListResponse;
import com.proprofessor.server.diagram.dto.DiagramMoveRequest;
import com.proprofessor.server.diagram.dto.DiagramUpdateRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for diagrams. Thin — delegates to {@link DiagramService} and
 * wraps results in {@link ApiResponse}.
 */
@RestController
@RequestMapping("/api/v1/diagrams")
public class DiagramController {

    private final DiagramService diagramService;
    private final DiagramFolderService diagramFolderService;

    public DiagramController(DiagramService diagramService, DiagramFolderService diagramFolderService) {
        this.diagramService = diagramService;
        this.diagramFolderService = diagramFolderService;
    }

    /** The whole sidebar — folders and diagrams — so entering the section is one request. */
    @GetMapping
    public ApiResponse<DiagramListResponse> list() {
        return ApiResponse.ok(new DiagramListResponse(
                diagramFolderService.listFolders(),
                diagramService.listDiagrams()
        ));
    }

    @GetMapping("/{id}")
    public ApiResponse<DiagramDetail> get(@PathVariable Long id) {
        return ApiResponse.ok(diagramService.getDiagram(id));
    }

    /** Case-insensitive title lookup — resolves `![[name.diagram]]` embeds. */
    @GetMapping("/by-title/{title}")
    public ApiResponse<DiagramDetail> getByTitle(@PathVariable String title) {
        return ApiResponse.ok(diagramService.getDiagramByTitle(title));
    }

    @PostMapping
    public ApiResponse<DiagramDetail> create(@RequestBody DiagramCreateRequest request) {
        return ApiResponse.ok("Diagram created.", diagramService.createDiagram(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<DiagramDetail> update(@PathVariable Long id, @RequestBody DiagramUpdateRequest request) {
        return ApiResponse.ok("Diagram updated.", diagramService.updateDiagram(id, request));
    }

    /** Separate from {@link #update} so the editor's autosave never carries a folder. */
    @PutMapping("/{id}/folder")
    public ApiResponse<DiagramDetail> move(@PathVariable Long id, @RequestBody DiagramMoveRequest request) {
        return ApiResponse.ok("Diagram moved.", diagramService.moveDiagram(id, request.folderId()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        diagramService.deleteDiagram(id);
        return ApiResponse.ok("Diagram deleted.", null);
    }
}
