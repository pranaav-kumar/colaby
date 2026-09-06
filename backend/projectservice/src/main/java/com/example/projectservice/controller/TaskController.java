package com.example.projectservice.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.projectservice.dto.AssignTaskRequest;
import com.example.projectservice.dto.TaskResponse;
import com.example.projectservice.dto.UpdateTaskProgressRequest;
import com.example.projectservice.service.TaskService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/projects/{projectId}/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    /** Creator assigns a task to a member */
    @PostMapping
    public ResponseEntity<TaskResponse> assignTask(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @Valid @RequestBody AssignTaskRequest request) {
        UUID creatorId = UUID.fromString(userIdHeader);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(taskService.assignTask(projectId, creatorId, request));
    }

    /** Any member views all tasks (team's progress dashboard) */
    @GetMapping
    public List<TaskResponse> getAllTasks(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return taskService.getAllTasks(projectId, UUID.fromString(userIdHeader));
    }

    /** Member views only their own assigned tasks */
    @GetMapping("/my")
    public List<TaskResponse> getMyTasks(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId) {
        return taskService.getMyTasks(projectId, UUID.fromString(userIdHeader));
    }

    /** Assignee updates progress (numeric % + descriptive note) */
    @PatchMapping("/{taskId}/progress")
    public TaskResponse updateProgress(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @Valid @RequestBody UpdateTaskProgressRequest request) {
        return taskService.updateProgress(projectId, taskId, UUID.fromString(userIdHeader), request);
    }

    /** Creator removes a task */
    @DeleteMapping("/{taskId}")
    public ResponseEntity<Void> deleteTask(
            @RequestHeader("X-User-Id") String userIdHeader,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {
        taskService.deleteTask(projectId, taskId, UUID.fromString(userIdHeader));
        return ResponseEntity.noContent().build();
    }
}
