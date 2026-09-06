package com.example.projectservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.projectservice.dto.CreateProjectRequest;
import com.example.projectservice.dto.ProjectResponse;
import com.example.projectservice.dto.UpdateProjectRequest;
import com.example.projectservice.entity.Project;
import com.example.projectservice.entity.ProjectMember;
import com.example.projectservice.entity.ProjectMember.ProjectMemberId;
import com.example.projectservice.exception.ForbiddenException;
import com.example.projectservice.exception.ResourceNotFoundException;
import com.example.projectservice.repository.ProjectMemberRepository;
import com.example.projectservice.repository.ProjectRepository;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;

    public ProjectService(ProjectRepository projectRepository,
                          ProjectMemberRepository projectMemberRepository) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
    }

    @Transactional
    public ProjectResponse createProject(UUID userId, CreateProjectRequest request) {
        if (projectRepository.existsByName(request.name().trim())) {
            throw new IllegalStateException("A project named '" + request.name() + "' already exists");
        }

        Instant now = Instant.now();
        Project project = new Project();
        project.setName(request.name().trim());
        project.setDescription(request.description());
        project.setGithubRepoUrl(request.githubRepoUrl());
        project.setTechStack(request.techStack());
        project.setStatus("ACTIVE");
        project.setCreatedBy(userId);
        project.setCreatedAt(now);
        project.setUpdatedAt(now);
        project = projectRepository.save(project);

        // Creator is automatically a CREATOR-role member
        projectMemberRepository.save(new ProjectMember(
                new ProjectMemberId(userId, project.getId()),
                "CREATOR",
                now
        ));

        return toResponse(project, userId);
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> getAllProjects(UUID userId) {
        return projectRepository.findAll()
                .stream()
                .map(p -> toResponse(p, userId))
                .toList();
    }

    @Transactional(readOnly = true)
    public ProjectResponse getProjectById(UUID projectId, UUID userId) {
        Project project = findProjectOrThrow(projectId);
        return toResponse(project, userId);
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> getMyProjects(UUID userId) {
        return projectMemberRepository.findByIdUserId(userId)
                .stream()
                .map(member -> {
                    Project project = findProjectOrThrow(member.getId().getProjectId());
                    return toResponse(project, userId);
                })
                .toList();
    }

    @Transactional
    public ProjectResponse updateProject(UUID projectId, UUID userId, UpdateProjectRequest request) {
        Project project = findProjectOrThrow(projectId);
        requireCreator(project, userId);

        if (request.name() != null && !request.name().isBlank()) {
            String trimmed = request.name().trim();
            if (!trimmed.equals(project.getName()) && projectRepository.existsByName(trimmed)) {
                throw new IllegalStateException("A project named '" + trimmed + "' already exists");
            }
            project.setName(trimmed);
        }
        if (request.description() != null) project.setDescription(request.description());
        if (request.githubRepoUrl() != null) project.setGithubRepoUrl(request.githubRepoUrl());
        if (request.techStack() != null) project.setTechStack(request.techStack());
        if (request.status() != null) {
            validateStatus(request.status());
            project.setStatus(request.status());
        }
        project.setUpdatedAt(Instant.now());

        return toResponse(projectRepository.save(project), userId);
    }

    @Transactional
    public void deleteProject(UUID projectId, UUID userId) {
        Project project = findProjectOrThrow(projectId);
        requireCreator(project, userId);
        projectRepository.delete(project);
    }

    @Transactional(readOnly = true)
    public List<ProjectMember> getMembers(UUID projectId, UUID requesterId) {
        findProjectOrThrow(projectId);
        requireMember(projectId, requesterId);
        return projectMemberRepository.findByIdProjectId(projectId);
    }

    // ---- Package-private helpers used by other services ----

    Project findProjectOrThrow(UUID projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project not found: " + projectId));
    }

    void requireCreator(Project project, UUID userId) {
        if (!project.getCreatedBy().equals(userId)) {
            throw new ForbiddenException("Only the project creator can perform this action");
        }
    }

    void requireMember(UUID projectId, UUID userId) {
        if (!projectMemberRepository.existsByIdUserIdAndIdProjectId(userId, projectId)) {
            throw new ForbiddenException("You are not a member of this project");
        }
    }

    void addMember(UUID projectId, UUID userId) {
        if (!projectMemberRepository.existsByIdUserIdAndIdProjectId(userId, projectId)) {
            projectMemberRepository.save(new ProjectMember(
                    new ProjectMemberId(userId, projectId),
                    "MEMBER",
                    Instant.now()
            ));
        }
    }

    // ---- Private helpers ----

    private void validateStatus(String status) {
        if (!status.equals("ACTIVE") && !status.equals("COMPLETED") && !status.equals("ARCHIVED")) {
            throw new IllegalArgumentException("Status must be ACTIVE, COMPLETED, or ARCHIVED");
        }
    }

    private ProjectResponse toResponse(Project project, UUID userId) {
        long memberCount = projectMemberRepository.countByIdProjectId(project.getId());
        boolean isMember = userId != null &&
                projectMemberRepository.existsByIdUserIdAndIdProjectId(userId, project.getId());
        return new ProjectResponse(
                project.getId(),
                project.getName(),
                project.getDescription(),
                project.getGithubRepoUrl(),
                project.getTechStack(),
                project.getStatus(),
                project.getCreatedBy(),
                project.getCreatedAt(),
                project.getUpdatedAt(),
                memberCount,
                isMember
        );
    }
}
