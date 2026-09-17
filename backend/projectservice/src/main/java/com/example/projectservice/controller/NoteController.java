package com.example.projectservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.projectservice.dto.CreateFolderRequest;
import com.example.projectservice.dto.CreateNoteRequest;
import com.example.projectservice.dto.NoteFolderResponse;
import com.example.projectservice.dto.NoteResponse;
import com.example.projectservice.dto.UpdateNoteRequest;
import com.example.projectservice.service.NoteService;

@RestController
@RequestMapping("/projects/{projectId}/notes")
public class NoteController {

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    // ─── Folders ──────────────────────────────────────────────────────────────

    /** Any member creates a folder */
    @PostMapping("/folders")
    public ResponseEntity<NoteFolderResponse> createFolder(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @RequestBody CreateFolderRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(noteService.createFolder(projectId, userId, request));
    }

    /** Any member lists all folders */
    @GetMapping("/folders")
    public List<NoteFolderResponse> getFolders(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return noteService.getFolders(projectId, UUID.fromString(userIdHeader));
    }

    /** Any member deletes a folder (also deletes notes inside) */
    @DeleteMapping("/folders/{folderId}")
    public ResponseEntity<Void> deleteFolder(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID folderId) {
        noteService.deleteFolder(projectId, UUID.fromString(userIdHeader), folderId);
        return ResponseEntity.noContent().build();
    }

    // ─── Notes ────────────────────────────────────────────────────────────────

    /** Any member creates a note */
    @PostMapping
    public ResponseEntity<NoteResponse> createNote(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @RequestBody CreateNoteRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(noteService.createNote(projectId, userId, request));
    }

    /** Any member lists all notes for the project */
    @GetMapping
    public List<NoteResponse> getNotes(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return noteService.getNotes(projectId, UUID.fromString(userIdHeader));
    }

    /** Any member reads a single note */
    @GetMapping("/{noteId}")
    public NoteResponse getNote(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID noteId) {
        return noteService.getNote(projectId, UUID.fromString(userIdHeader), noteId);
    }

    /** Any member updates a note */
    @PutMapping("/{noteId}")
    public NoteResponse updateNote(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID noteId,
            @RequestBody UpdateNoteRequest request) {
        return noteService.updateNote(projectId, UUID.fromString(userIdHeader), noteId, request);
    }

    /** Any member deletes a note */
    @DeleteMapping("/{noteId}")
    public ResponseEntity<Void> deleteNote(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID noteId) {
        noteService.deleteNote(projectId, UUID.fromString(userIdHeader), noteId);
        return ResponseEntity.noContent().build();
    }
}
