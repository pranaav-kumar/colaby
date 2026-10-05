package com.example.projectservice.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
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

    private final ProjectService projectService;
    private final String configuredServiceKey;

    public InternalProjectController(
            ProjectService projectService,
            @Value("${project-service.key}") String configuredServiceKey) {
        this.projectService = projectService;
        this.configuredServiceKey = configuredServiceKey;
    }

    /**
     * Internal: Get all members of a project.
     * Used by the collaboration-service to verify project membership.
     */
    @GetMapping("/{projectId}/members")
    public ResponseEntity<List<MemberResponse>> getMembersInternal(
            @PathVariable UUID projectId,
            @RequestHeader(value = "X-Service-Key", required = false) String serviceKey) {
        if (serviceKey == null || serviceKey.isBlank() || configuredServiceKey == null ||
                configuredServiceKey.isBlank() || !MessageDigest.isEqual(
                        configuredServiceKey.getBytes(StandardCharsets.UTF_8),
                        serviceKey.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(403).build();
        }
        // Use the project creator/any member as the requester (internal bypass)
        // We pass a dummy UUID that won't restrict results since this is a trusted call
        List<MemberResponse> members = projectService.getMembersInternal(projectId);
        return ResponseEntity.ok(members);
    }
}
