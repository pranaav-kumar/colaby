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

import com.example.projectservice.dto.CreateProjectRequest;
import com.example.projectservice.dto.ProjectResponse;
import com.example.projectservice.dto.UpdateProjectRequest;
import com.example.projectservice.entity.ProjectMember;
import com.example.projectservice.service.ProjectService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> createProject(
            @RequestHeader("X-User-Id") String userIdHeader,
            @Valid @RequestBody CreateProjectRequest request) {
        UUID userId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.createProject(userId, request));
    }

    @GetMapping
    public List<ProjectResponse> getAllProjects(
            @RequestHeader("X-User-Id") String userIdHeader) {
        return projectService.getAllProjects(UUID.fromString(userIdHeader));
    }

    @GetMapping("/my")
    public List<ProjectResponse> getMyProjects(
            @RequestHeader("X-User-Id") String userIdHeader) {
        return projectService.getMyProjects(UUID.fromString(userIdHeader));
    }

    @GetMapping("/{projectId}")
    public ProjectResponse getProject(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return projectService.getProjectById(projectId, UUID.fromString(userIdHeader));
    }

    @PutMapping("/{projectId}")
    public ProjectResponse updateProject(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @RequestBody UpdateProjectRequest request) {
        return projectService.updateProject(projectId, UUID.fromString(userIdHeader), request);
    }

    @DeleteMapping("/{projectId}")
    public ResponseEntity<Void> deleteProject(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        projectService.deleteProject(projectId, UUID.fromString(userIdHeader));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{projectId}/members")
    public List<ProjectMember> getMembers(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return projectService.getMembers(projectId, UUID.fromString(userIdHeader));
    }
}
