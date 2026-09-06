package com.example.projectservice.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record AssignTaskRequest(
        @NotNull(message = "assignedTo user ID is required") UUID assignedTo,
        @NotBlank(message = "Task title is required") String title,
        String description
) {}
