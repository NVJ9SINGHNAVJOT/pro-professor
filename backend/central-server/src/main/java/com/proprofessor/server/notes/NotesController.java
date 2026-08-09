package com.proprofessor.server.notes;

import com.proprofessor.server.common.dto.ApiResponse;
import com.proprofessor.server.notes.dto.NoteCreateRequest;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteExplorerResponse;
import com.proprofessor.server.notes.dto.NoteLinksResponse;
import com.proprofessor.server.notes.dto.NoteListResponse;
import com.proprofessor.server.notes.dto.NoteMoveRequest;
import com.proprofessor.server.notes.dto.NoteRenameRequest;
import com.proprofessor.server.notes.dto.NoteUpdateRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for Markdown notes. Thin — delegates to {@link NotesService}
 * and wraps results in {@link ApiResponse}.
 */
@RestController
@RequestMapping("/api/v1/notes")
public class NotesController {

    private final NotesService notesService;
    private final NoteFolderService noteFolderService;

    public NotesController(NotesService notesService, NoteFolderService noteFolderService) {
        this.notesService = notesService;
        this.noteFolderService = noteFolderService;
    }

    /**
     * The explorer's listing: every folder and every note in one response, because the tree needs
     * both to draw a single level. {@code ?tag=} filters the notes and leaves the folders alone —
     * the tag browser is a flat view that doesn't use them.
     */
    @GetMapping
    public ApiResponse<NoteExplorerResponse> list(@RequestParam(required = false) String tag) {
        return ApiResponse.ok(
                new NoteExplorerResponse(noteFolderService.listFolders(), notesService.listNotes(tag)));
    }

    /** Keyword search over title + content (Postgres FTS), best match first. */
    @GetMapping("/search")
    public ApiResponse<NoteListResponse> search(@RequestParam String q) {
        return ApiResponse.ok(new NoteListResponse(notesService.searchNotes(q)));
    }

    /** Every note's outgoing links — the edge list the graph view is generated from. */
    @GetMapping("/links")
    public ApiResponse<NoteLinksResponse> links() {
        return ApiResponse.ok(new NoteLinksResponse(notesService.listLinks()));
    }

    /** Notes whose content links to this note. */
    @GetMapping("/{id}/backlinks")
    public ApiResponse<NoteListResponse> backlinks(@PathVariable Long id) {
        return ApiResponse.ok(new NoteListResponse(notesService.getBacklinks(id)));
    }

    @GetMapping("/{id}")
    public ApiResponse<NoteDetail> get(@PathVariable Long id) {
        return ApiResponse.ok(notesService.getNote(id));
    }

    @PostMapping
    public ApiResponse<NoteDetail> create(@RequestBody NoteCreateRequest request) {
        return ApiResponse.ok("Note created.", notesService.createNote(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<NoteDetail> update(@PathVariable Long id, @RequestBody NoteUpdateRequest request) {
        return ApiResponse.ok("Note updated.", notesService.updateNote(id, request));
    }

    /** Rename only — separate from the save above, which rewrites the content. */
    @PutMapping("/{id}/title")
    public ApiResponse<NoteDetail> rename(@PathVariable Long id, @RequestBody NoteRenameRequest request) {
        return ApiResponse.ok("Note renamed.", notesService.renameNote(id, request.title()));
    }

    /** Moves a note between folders — null {@code folderId} is the root level. */
    @PutMapping("/{id}/folder")
    public ApiResponse<NoteDetail> move(@PathVariable Long id, @RequestBody NoteMoveRequest request) {
        return ApiResponse.ok("Note moved.", notesService.moveNote(id, request.folderId()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        notesService.deleteNote(id);
        return ApiResponse.ok("Note deleted.", null);
    }
}
