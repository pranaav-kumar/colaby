package com.example.projectservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.projectservice.dto.CreateFolderRequest;
import com.example.projectservice.dto.CreateNoteRequest;
import com.example.projectservice.dto.NoteFolderResponse;
import com.example.projectservice.dto.NoteResponse;
import com.example.projectservice.dto.UpdateNoteRequest;
import com.example.projectservice.entity.NoteFolder;
import com.example.projectservice.entity.ProjectNote;
import com.example.projectservice.exception.ForbiddenException;
import com.example.projectservice.exception.ResourceNotFoundException;
import com.example.projectservice.repository.NoteFolderRepository;
import com.example.projectservice.repository.ProjectNoteRepository;

@Service
public class NoteService {

    private final ProjectNoteRepository noteRepo;
    private final NoteFolderRepository folderRepo;
    private final ProjectService projectService;

    public NoteService(ProjectNoteRepository noteRepo,
                       NoteFolderRepository folderRepo,
                       ProjectService projectService) {
        this.noteRepo = noteRepo;
        this.folderRepo = folderRepo;
        this.projectService = projectService;
    }

    // ─── Folders ──────────────────────────────────────────────────────────────

    @Transactional
    public NoteFolderResponse createFolder(UUID projectId, UUID userId, CreateFolderRequest req) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        NoteFolder folder = new NoteFolder();
        folder.setProjectId(projectId);
        folder.setParentFolderId(req.parentFolderId());
        folder.setName(req.name().trim());
        folder.setCreatedBy(userId);
        folder.setCreatedAt(Instant.now());

        return toFolderResponse(folderRepo.save(folder));
    }

    @Transactional(readOnly = true)
    public List<NoteFolderResponse> getFolders(UUID projectId, UUID userId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);
        return folderRepo.findByProjectIdOrderByNameAsc(projectId)
                .stream().map(this::toFolderResponse).collect(Collectors.toList());
    }

    @Transactional
    public void deleteFolder(UUID projectId, UUID userId, UUID folderId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        NoteFolder folder = folderRepo.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found"));

        if (!folder.getProjectId().equals(projectId)) {
            throw new ForbiddenException("Folder does not belong to this project");
        }

        // Delete all notes inside the folder first
        noteRepo.deleteByFolderId(folderId);
        folderRepo.deleteById(folderId);
    }

    // ─── Notes ────────────────────────────────────────────────────────────────

    @Transactional
    public NoteResponse createNote(UUID projectId, UUID userId, CreateNoteRequest req) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        ProjectNote note = new ProjectNote();
        note.setProjectId(projectId);
        note.setFolderId(req.folderId());
        note.setTitle(req.title() != null ? req.title().trim() : "Untitled");
        note.setContent(req.content() != null ? req.content() : "");
        note.setCreatedBy(userId);
        note.setLastEditedBy(userId);
        Instant now = Instant.now();
        note.setCreatedAt(now);
        note.setUpdatedAt(now);

        return toNoteResponse(noteRepo.save(note));
    }

    @Transactional(readOnly = true)
    public List<NoteResponse> getNotes(UUID projectId, UUID userId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);
        return noteRepo.findByProjectIdOrderByUpdatedAtDesc(projectId)
                .stream().map(this::toNoteResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public NoteResponse getNote(UUID projectId, UUID userId, UUID noteId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        ProjectNote note = noteRepo.findById(noteId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found"));

        if (!note.getProjectId().equals(projectId)) {
            throw new ForbiddenException("Note does not belong to this project");
        }

        return toNoteResponse(note);
    }

    @Transactional
    public NoteResponse updateNote(UUID projectId, UUID userId, UUID noteId, UpdateNoteRequest req) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        ProjectNote note = noteRepo.findById(noteId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found"));

        if (!note.getProjectId().equals(projectId)) {
            throw new ForbiddenException("Note does not belong to this project");
        }

        if (req.title() != null) note.setTitle(req.title().trim());
        if (req.content() != null) note.setContent(req.content());
        note.setLastEditedBy(userId);
        note.setUpdatedAt(Instant.now());

        return toNoteResponse(noteRepo.save(note));
    }

    @Transactional
    public void deleteNote(UUID projectId, UUID userId, UUID noteId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);

        ProjectNote note = noteRepo.findById(noteId)
                .orElseThrow(() -> new ResourceNotFoundException("Note not found"));

        if (!note.getProjectId().equals(projectId)) {
            throw new ForbiddenException("Note does not belong to this project");
        }

        noteRepo.deleteById(noteId);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private NoteFolderResponse toFolderResponse(NoteFolder f) {
        return new NoteFolderResponse(
                f.getId(), f.getProjectId(), f.getParentFolderId(),
                f.getName(), f.getCreatedBy(), f.getCreatedAt());
    }

    private NoteResponse toNoteResponse(ProjectNote n) {
        return new NoteResponse(
                n.getId(), n.getProjectId(), n.getFolderId(),
                n.getTitle(), n.getContent(),
                n.getCreatedBy(), n.getLastEditedBy(),
                n.getCreatedAt(), n.getUpdatedAt());
    }
}
