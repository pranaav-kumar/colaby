package com.example.projectservice.controller;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.projectservice.dto.DocResponse;
import com.example.projectservice.dto.UpsertDocRequest;
import com.example.projectservice.service.DocService;

@RestController
@RequestMapping("/projects/{projectId}/docs")
public class DocController {

    private final DocService docService;

    public DocController(DocService docService) {
        this.docService = docService;
    }

    /** Creator creates or fully replaces the project documentation */
    @PutMapping
    public ResponseEntity<DocResponse> upsertDoc(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @RequestBody UpsertDocRequest request) {
        UUID creatorId = UUID.fromString(userIdHeader);
        return ResponseEntity.ok(docService.upsertDoc(projectId, creatorId, request));
    }

    /** Any project member reads the documentation (view-only) */
    @GetMapping
    public DocResponse getDoc(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return docService.getDoc(projectId, UUID.fromString(userIdHeader));
    }
}
