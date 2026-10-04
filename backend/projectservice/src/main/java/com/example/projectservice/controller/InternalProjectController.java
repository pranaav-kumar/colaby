package com.example.projectservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.projectservice.dto.MemberResponse;
import com.example.projectservice.service.ProjectService;

/**
 * Internal endpoints for service-to-service communication.
 * These are NOT exposed through the API Gateway.
 * Protected by the X-Service-Key header.
 */
@RestController
@RequestMapping("/projects/internal")
public class InternalProjectController {

    private static final String SERVICE_KEY = "colaby-internal-dev-key-2026";

    private final ProjectService projectService;

    public InternalProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    /**
     * Internal: Get all members of a project.
     * Used by the collaboration-service to verify project membership.
     */
    @GetMapping("/{projectId}/members")
    public ResponseEntity<List<MemberResponse>> getMembersInternal(
            @PathVariable UUID projectId,
            @RequestHeader(value = "X-Service-Key", required = false) String serviceKey) {
        if (!SERVICE_KEY.equals(serviceKey)) {
            return ResponseEntity.status(403).build();
        }
        // Use the project creator/any member as the requester (internal bypass)
        // We pass a dummy UUID that won't restrict results since this is a trusted call
        List<MemberResponse> members = projectService.getMembersInternal(projectId);
        return ResponseEntity.ok(members);
    }
}
