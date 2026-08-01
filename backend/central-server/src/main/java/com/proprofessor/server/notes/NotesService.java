package com.proprofessor.server.notes;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.proprofessor.server.common.db.NoteRow;
import com.proprofessor.server.common.exception.AppException;
import com.proprofessor.server.common.exception.ResourceNotFoundException;
import com.proprofessor.server.media.MediaService;
import com.proprofessor.server.notes.dto.NoteCreateRequest;
import com.proprofessor.server.notes.dto.NoteDetail;
import com.proprofessor.server.notes.dto.NoteLinkDto;
import com.proprofessor.server.notes.dto.NoteSummary;
import com.proprofessor.server.notes.dto.NoteUpdateRequest;
import com.proprofessor.server.notes.mapper.NoteMapper;
import com.proprofessor.server.notes.repository.NotesRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CRUD for Markdown notes. On every save the content's YAML frontmatter is parsed
 * (title/tags/anything else) into the {@code frontmatter} jsonb column and the
 * note's tag links are rebuilt.
 */
@Service
public class NotesService {

    private static final Pattern FIRST_HEADING = Pattern.compile("^#{1,6}\\s+(.+)$", Pattern.MULTILINE);
    private static final String DEFAULT_TITLE = "Untitled";
    private static final int MAX_TITLE_LENGTH = 255;

    private final NotesRepository notesRepository;
    private final NoteMapper noteMapper;
    private final ObjectMapper objectMapper;
    private final MediaService mediaService;

    public NotesService(NotesRepository notesRepository, NoteMapper noteMapper, ObjectMapper objectMapper,
                        MediaService mediaService) {
        this.notesRepository = notesRepository;
        this.noteMapper = noteMapper;
        this.objectMapper = objectMapper;
        this.mediaService = mediaService;
    }

    /** All notes, or only those carrying {@code tag} when it is given. */
    public List<NoteSummary> listNotes(String tag) {
        List<NoteRow> notes = (tag == null || tag.isBlank())
                ? notesRepository.findAll()
                : notesRepository.findAllByTag(tag.trim());
        return toSummaries(notes);
    }

    /** Keyword search (Postgres FTS over title + content), best match first. */
    public List<NoteSummary> searchNotes(String query) {
        if (query == null || query.isBlank()) return List.of();
        return toSummaries(notesRepository.search(query.trim()));
    }

    /** Every note's outgoing links — the edge list for the graph view. */
    public List<NoteLinkDto> listLinks() {
        return notesRepository.findAllLinks().entrySet().stream()
                .flatMap(entry -> entry.getValue().stream()
                        .map(link -> new NoteLinkDto(entry.getKey(), link.targetRef(), link.type())))
                .toList();
    }

    /** Notes that link to this note (by its title). */
    public List<NoteSummary> getBacklinks(long id) {
        NoteRow note = requireNote(id);
        return toSummaries(notesRepository.findBacklinks(note.title()));
    }

    private List<NoteSummary> toSummaries(List<NoteRow> notes) {
        Map<Long, List<String>> tagsByNote =
                notesRepository.findTagsByNoteIds(notes.stream().map(NoteRow::id).toList());
        return notes.stream()
                .map(note -> noteMapper.toSummary(note, tagsByNote.getOrDefault(note.id(), List.of())))
                .toList();
    }

    public NoteDetail getNote(long id) {
        NoteRow note = requireNote(id);
        return noteMapper.toDetail(note, notesRepository.findTagsByNoteId(id), resolveEmbedUrls(note.content()));
    }

    /**
     * Direct storage-server URLs for the note's image {@code ![[file.png]]} embeds, resolved once
     * at read time so the frontend renders embedded images straight from storage (no per-image
     * round-trip). Note-to-note embeds don't match an uploaded filename and are skipped.
     */
    private Map<String, String> resolveEmbedUrls(String content) {
        Map<String, String> urls = new LinkedHashMap<>();
        for (LinkParser.Link link : LinkParser.parse(Frontmatter.parse(content).body()).links()) {
            if (LinkParser.TYPE_EMBED.equals(link.type())) {
                mediaService.urlByFilename(link.targetRef())
                        .ifPresent(url -> urls.put(link.targetRef(), url));
            }
        }
        return urls;
    }

    @Transactional
    public NoteDetail createNote(NoteCreateRequest request) {
        String content = request.content() == null ? "" : request.content();
        Frontmatter frontmatter = Frontmatter.parse(content);
        String title = uniqueTitle(resolveTitle(frontmatter, request.title(), null), null);
        NoteRow note = notesRepository.insert(title, content, toJson(frontmatter.map()));
        indexRefs(note.id(), frontmatter);
        return getNote(note.id());
    }

    @Transactional
    public NoteDetail updateNote(long id, NoteUpdateRequest request) {
        NoteRow existing = requireNote(id);
        String content = request.content() == null ? "" : request.content();
        Frontmatter frontmatter = Frontmatter.parse(content);
        // The note's own title is the fallback, so a content-only save never renames it — the
        // editor sends no title, because renaming is {@link #renameNote}'s job.
        String title = uniqueTitle(resolveTitle(frontmatter, request.title(), existing.title()), id);
        notesRepository.update(id, title, content, toJson(frontmatter.map()));
        indexRefs(id, frontmatter);
        return getNote(id);
    }

    /**
     * Renames a note and nothing else — the content, its frontmatter, tags and links are left
     * exactly as they are, and no revision is snapshotted (revisions capture content).
     *
     * <p>Deliberately not part of {@link #updateNote}, which is the editor's save path: renaming
     * from the toolbar must not also persist whatever is sitting unsaved in the buffer. A
     * frontmatter {@code title:} still wins on the note's next content save.
     */
    @Transactional
    public NoteDetail renameNote(long id, String title) {
        requireNote(id);
        if (title == null || title.isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Note title must not be blank.");
        }
        notesRepository.updateTitle(id, uniqueTitle(truncate(title.trim()), id));
        return getNote(id);
    }

    /** Rebuilds the note's tag links (frontmatter + inline #tags) and outgoing wiki-links/embeds. */
    private void indexRefs(long noteId, Frontmatter frontmatter) {
        LinkParser.ParsedRefs refs = LinkParser.parse(frontmatter.body());
        List<String> tags = new ArrayList<>(frontmatter.tags());
        refs.tags().stream().filter(tag -> !tags.contains(tag)).forEach(tags::add);
        notesRepository.replaceTags(noteId, tags);
        notesRepository.replaceLinks(noteId, refs.links());
    }

    @Transactional
    public void deleteNote(long id) {
        requireNote(id);
        notesRepository.deleteById(id);
    }

    private NoteRow requireNote(long id) {
        return notesRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found: " + id));
    }

    /**
     * Title precedence: frontmatter {@code title} → request title → {@code current} → "Untitled".
     * {@code current} is the note's existing title on an update, and null on a create.
     */
    private static String resolveTitle(Frontmatter frontmatter, String requestTitle, String current) {
        String title = frontmatter.title();
        if (title == null && requestTitle != null && !requestTitle.isBlank()) title = requestTitle.trim();
        if (title == null && current != null && !current.isBlank()) title = current;
        if (title == null || title.isBlank()) title = DEFAULT_TITLE;
        return truncate(title);
    }

    private static String truncate(String title) {
        return title.length() > MAX_TITLE_LENGTH ? title.substring(0, MAX_TITLE_LENGTH) : title;
    }

    /**
     * Titles identify notes (wiki-links resolve by them), so they are unique. A taken
     * title gets a numeric suffix: "Untitled" → "Untitled 2" → "Untitled 3" …
     */
    private String uniqueTitle(String title, Long selfId) {
        String candidate = title;
        for (int suffix = 2; isTaken(candidate, selfId); suffix++) {
            candidate = title + " " + suffix;
        }
        return candidate;
    }

    private boolean isTaken(String title, Long selfId) {
        return notesRepository.findByTitle(title)
                .filter(existing -> selfId == null || existing.id() != selfId)
                .isPresent();
    }

    private String toJson(Map<String, Object> frontmatter) {
        try {
            return objectMapper.writeValueAsString(frontmatter);
        } catch (JsonProcessingException ex) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Frontmatter has values that can't be stored");
        }
    }
}
