package com.example.projectservice.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.projectservice.client.UserLookupClient;
import com.example.projectservice.dto.AssignTaskRequest;
import com.example.projectservice.dto.TaskResponse;
import com.example.projectservice.dto.UpdateTaskProgressRequest;
import com.example.projectservice.dto.UserInfo;
import com.example.projectservice.entity.Project;
import com.example.projectservice.entity.ProjectTask;
import com.example.projectservice.exception.ForbiddenException;
import com.example.projectservice.exception.ResourceNotFoundException;
import com.example.projectservice.repository.ProjectTaskRepository;

@Service
public class TaskService {

    private final ProjectTaskRepository taskRepository;
    private final ProjectService projectService;
    private final UserLookupClient userLookupClient;

    public TaskService(ProjectTaskRepository taskRepository,
                       ProjectService projectService,
                       UserLookupClient userLookupClient) {
        this.taskRepository = taskRepository;
        this.projectService = projectService;
        this.userLookupClient = userLookupClient;
    }

    /**
     * Creator assigns a task to a project member.
     */
    @Transactional
    public TaskResponse assignTask(UUID projectId, UUID creatorId, AssignTaskRequest request) {
        Project project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);

        // The assigned user must already be a member
        projectService.requireMember(projectId, request.assignedTo());

        Instant now = Instant.now();
        ProjectTask task = new ProjectTask();
        task.setProjectId(projectId);
        task.setAssignedTo(request.assignedTo());
        task.setAssignedBy(creatorId);
        task.setTitle(request.title().trim());
        task.setDescription(request.description());
        task.setProgressPercent(0);
        task.setProgressNote(null);
        task.setStatus("TODO");
        task.setCreatedAt(now);
        task.setUpdatedAt(now);

        return toResponse(taskRepository.save(task));
    }

    /**
     * Get all tasks for a project (team progress view). Members only.
     */
    @Transactional(readOnly = true)
    public List<TaskResponse> getAllTasks(UUID projectId, UUID requesterId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, requesterId);
        return taskRepository.findByProjectId(projectId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Get only the tasks assigned to the requesting user.
     */
    @Transactional(readOnly = true)
    public List<TaskResponse> getMyTasks(UUID projectId, UUID userId) {
        projectService.findProjectOrThrow(projectId);
        projectService.requireMember(projectId, userId);
        return taskRepository.findByProjectIdAndAssignedTo(projectId, userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Assignee updates their task's progress (numeric % + optional text note).
     * Auto-derives status: 0% → TODO, 1–99% → IN_PROGRESS, 100% → DONE.
     */
    @Transactional
    public TaskResponse updateProgress(UUID projectId, UUID taskId, UUID userId,
                                       UpdateTaskProgressRequest request) {
        projectService.findProjectOrThrow(projectId);
        ProjectTask task = findTaskOrThrow(taskId);

        if (!task.getProjectId().equals(projectId)) {
            throw new ResourceNotFoundException("Task not found in this project");
        }
        if (!task.getAssignedTo().equals(userId)) {
            throw new ForbiddenException("Only the task assignee can update progress");
        }

        task.setProgressPercent(request.progressPercent());
        task.setProgressNote(request.progressNote());
        task.setStatus(deriveStatus(request.progressPercent()));
        task.setUpdatedAt(Instant.now());

        return toResponse(taskRepository.save(task));
    }

    /**
     * Creator removes a task from the project.
     */
    @Transactional
    public void deleteTask(UUID projectId, UUID taskId, UUID creatorId) {
        Project project = projectService.findProjectOrThrow(projectId);
        projectService.requireCreator(project, creatorId);

        ProjectTask task = findTaskOrThrow(taskId);
        if (!task.getProjectId().equals(projectId)) {
            throw new ResourceNotFoundException("Task not found in this project");
        }
        taskRepository.delete(task);
    }

    // ---- Private helpers ----

    private ProjectTask findTaskOrThrow(UUID taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found: " + taskId));
    }

    private String deriveStatus(int progressPercent) {
        if (progressPercent == 0) return "TODO";
        if (progressPercent == 100) return "DONE";
        return "IN_PROGRESS";
    }

    private TaskResponse toResponse(ProjectTask task) {
        UserInfo assignedTo = userLookupClient.getUser(task.getAssignedTo());
        UserInfo assignedBy = userLookupClient.getUser(task.getAssignedBy());
        String projectName = null;
        try {
            projectName = projectService.findProjectOrThrow(task.getProjectId()).getName();
        } catch (Exception ignored) {}
        return new TaskResponse(
                task.getId(),
                task.getProjectId(),
                projectName,
                task.getAssignedTo(),
                assignedTo != null ? assignedTo.userName() : null,
                assignedTo != null ? assignedTo.fullName() : null,
                task.getAssignedBy(),
                assignedBy != null ? assignedBy.userName() : null,
                assignedBy != null ? assignedBy.fullName() : null,
                task.getTitle(),
                task.getDescription(),
                task.getProgressPercent(),
                task.getProgressNote(),
                task.getStatus(),
                task.getCreatedAt(),
                task.getUpdatedAt()
        );
    }
}
